import os
import shutil
import uvicorn
import nest_asyncio
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List
from dotenv import load_dotenv

from llama_parse import LlamaParse
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_mistralai import ChatMistralAI
from langchain_core.prompts import ChatPromptTemplate, PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_community.tools.tavily_search import TavilySearchResults

load_dotenv()
nest_asyncio.apply()

app = FastAPI(title="PDF RAG API (Ultra-Lightweight 512MB Optimized)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Global States (Storing chunks directly in memory without heavy embeddings)
global_chunks = []
global_text = "" 
llm_instance = None 

# --- DATA MODELS ---
class ChatMessage(BaseModel):
    role: str
    content: str

class QueryRequest(BaseModel):
    question: str
    history: List[ChatMessage] = []

class QuizQuestion(BaseModel):
    question: str = Field(description="A multiple choice or short answer question")
    answer: str = Field(description="The correct answer")

class StudyGuide(BaseModel):
    summary: str = Field(description="A brief 2-3 sentence summary of the document")
    takeaways: List[str] = Field(description="3 to 5 key takeaways or important facts")
    quiz: List[QuizQuestion] = Field(description="3 quiz questions to test knowledge")

# --- LIGHTWEIGHT RETRIEVER FUNCTION ---
def retrieve_relevant_chunks(query: str, chunks: List[Document], k: int = 4) -> str:
    """Keyword-based scoring retriever to save RAM (No heavy embedding models needed)"""
    query_words = set(query.lower().split())
    scored_chunks = []
    
    for chunk in chunks:
        content_lower = chunk.page_content.lower()
        # Count matching words as a simple relevance score
        score = sum(1 for word in query_words if word in content_lower)
        scored_chunks.append((score, chunk))
    
    # Sort by score highest first, fallback to first few if no keyword matches
    scored_chunks.sort(key=lambda x: x[0], reverse=True)
    top_chunks = [chunk for score, chunk in scored_chunks[:k]]
    
    return "\n\n".join([f"[Page {doc.metadata.get('page', 1)}]:\n{doc.page_content}" for doc in top_chunks])

# --- ENDPOINTS ---
@app.get("/")
async def root():
    return {"message": "DocuMind API is running successfully (512MB Optimized)!"}

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    global global_chunks, global_text, llm_instance
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files allowed.")

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # 1. Parse with LlamaParse
        parser = LlamaParse(
            api_key=os.getenv("LLAMA_CLOUD_API_KEY"),
            result_type="markdown", 
            verbose=True
        )
        parsed_docs = parser.load_data(file_path)
        
        docs = [
            Document(page_content=doc.text, metadata={"page": i + 1}) 
            for i, doc in enumerate(parsed_docs)
        ]
        global_text = "\n".join([doc.page_content for doc in docs])

        # Chunk sizes to keep Markdown tables intact
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=300)
        global_chunks = text_splitter.split_documents(docs)

        # Initialize lightweight Chat model only
        llm_instance = ChatMistralAI(model="mistral-small-latest", temperature=0)

        return {"message": "PDF processed successfully (Lightweight mode)!", "filename": file.filename}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
async def chat_pdf(request: QueryRequest):
    global global_chunks, llm_instance
    if not global_chunks or not llm_instance:
        raise HTTPException(status_code=400, detail="Please upload a PDF first.")

    # Retrieve relevant text chunks using lightweight keyword matching
    context = retrieve_relevant_chunks(request.question, global_chunks, k=4)

    # Format chat history text manually for lightweight execution
    history_text = ""
    for msg in request.history:
        role = "User" if msg.role == "user" else "Assistant"
        history_text += f"{role}: {msg.content}\n"

    # Construct clean prompt
    prompt = f"""You are an expert financial assistant analyzing a document.
Use ONLY the provided context to answer the question. The context may contain complex markdown tables.
If the exact answer is NOT in the context, you MUST reply with exactly and ONLY this code: 'TRIGGER_WEB_SEARCH'
Do not explain yourself. Do not include citations. Just answer the question directly.

Chat History:
{history_text}

Context:
{context}

Question: {request.question}
Answer:"""

    res = llm_instance.invoke(prompt)
    answer_text = res.content

    # Check for secret trigger code for web search fallback
    if "TRIGGER_WEB_SEARCH" in answer_text:
        print("Answer not in PDF. Triggering Web Search Fallback...")
        try:
            web_search = TavilySearchResults(max_results=3)
            search_results = web_search.invoke(request.question)
            
            web_context = "\n\n".join([f"Source: {doc['url']}\nContent: {doc['content']}" for doc in search_results])
            
            fallback_prompt = f"Answer the user's question using ONLY this live web search data. Do not use outside knowledge.\n\nWeb Data:\n{web_context}\n\nQuestion: {request.question}"
            fallback_res = llm_instance.invoke(fallback_prompt)
            
            top_url = search_results[0]['url'] if search_results else "https://google.com"
            
            return {
                "answer": fallback_res.content,
                "sources": [{"page": "Web", "url": top_url, "content": "Live Internet Search"}]
            }
            
        except Exception as e:
            return {"answer": "I couldn't find the answer in the document, and my web search failed.", "sources": []}

    return {"answer": answer_text, "sources": [{"page": 1, "content": context[:300]}]}


@app.post("/study-guide")
async def generate_study_guide():
    global global_text, llm_instance
    if not global_text or not llm_instance:
        raise HTTPException(status_code=400, detail="Please upload a PDF first.")
    
    try:
        context = global_text[:8000] # Limit context size for 512MB RAM safety
        parser = JsonOutputParser(pydantic_object=StudyGuide)
        
        prompt = PromptTemplate(
            template="Analyze the following document and extract the information.\n{format_instructions}\n\nDocument Text:\n{context}\n",
            input_variables=["context"],
            partial_variables={"format_instructions": parser.get_format_instructions()},
        )
        
        chain = prompt | llm_instance | parser
        guide = chain.invoke({"context": context})
        return guide
        
    except Exception as e:
        print(f"Study Guide Error: {str(e)}") 
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
