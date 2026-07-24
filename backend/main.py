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
from langchain_mistralai import ChatMistralAI, MistralAIEmbeddings
from langchain_classic.chains import create_retrieval_chain, create_history_aware_retriever
from langchain_classic.chains.combine_documents import create_stuff_documents_chain 
from langchain_core.vectorstores import InMemoryVectorStore 
from langchain_core.prompts import ChatPromptTemplate, PromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_community.tools.tavily_search import TavilySearchResults

load_dotenv()
nest_asyncio.apply()

app = FastAPI(title="PDF RAG API (Mistral + LlamaParse + Memory + Web)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Global States
rag_chain = None
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

# --- ENDPOINTS ---
@app.get("/")
async def root():
    return {"message": "DocuMind API is running successfully!"}

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    global rag_chain, global_text, llm_instance
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files allowed.")

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
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

        text_splitter = RecursiveCharacterTextSplitter(chunk_size=3000, chunk_overlap=400)
        splits = text_splitter.split_documents(docs)

        embeddings = MistralAIEmbeddings()
        vectorstore = InMemoryVectorStore.from_documents(documents=splits, embedding=embeddings)
        retriever = vectorstore.as_retriever(search_kwargs={"k": 6})

        llm_instance = ChatMistralAI(model="mistral-small-latest", temperature=0)
        
        contextualize_q_prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "Given a chat history and the latest user question which might reference context in the chat history, "
                "formulate a standalone question which can be understood without the chat history. "
                "Do NOT answer the question, just reformulate it if needed and otherwise return it as is."
            )),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ])
        history_aware_retriever = create_history_aware_retriever(llm_instance, retriever, contextualize_q_prompt)

        # --- FIX: Highly structured system prompt so it strictly checks the PDF ---
        qa_prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an intelligent AI assistant analyzing a user's uploaded document.\n"
                "You must use ONLY the context provided below to answer the user's question.\n\n"
                "--- START OF DOCUMENT CONTEXT ---\n"
                "{context}\n"
                "--- END OF DOCUMENT CONTEXT ---\n\n"
                "Instructions:\n"
                "1. Read the document context carefully.\n"
                "2. If the exact answer or relevant information is in the context above, provide a helpful and detailed response.\n"
                "3. If the context above DOES NOT contain the answer, do not guess. You MUST reply exactly and ONLY with this code: TRIGGER_WEB_SEARCH"
            )),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ])
        
        combine_docs_chain = create_stuff_documents_chain(llm_instance, qa_prompt)
        rag_chain = create_retrieval_chain(history_aware_retriever, combine_docs_chain)

        return {"message": "PDF processed successfully!", "filename": file.filename}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
async def chat_pdf(request: QueryRequest):
    global rag_chain, llm_instance
    if not rag_chain:
        raise HTTPException(status_code=400, detail="Please upload a PDF first.")

    langchain_history = []
    for msg in request.history:
        if msg.role == "user":
            langchain_history.append(HumanMessage(content=msg.content))
        elif msg.role == "bot":
            langchain_history.append(AIMessage(content=msg.content))

    res = rag_chain.invoke({
        "input": request.question,
        "chat_history": langchain_history
    })
    
    if "TRIGGER_WEB_SEARCH" in res["answer"]:
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

    sources = [{"page": doc.metadata.get("page", 0) + 1, "content": doc.page_content} for doc in res.get("context", [])]
    return {"answer": res["answer"], "sources": sources}


@app.post("/study-guide")
async def generate_study_guide():
    global global_text
    if not global_text:
        raise HTTPException(status_code=400, detail="Please upload a PDF first.")
    
    try:
        context = global_text[:12000] 
        llm = ChatMistralAI(model="mistral-small-latest", temperature=0.2)
        parser = JsonOutputParser(pydantic_object=StudyGuide)
        
        prompt = PromptTemplate(
            template="Analyze the following document and extract the information.\n{format_instructions}\n\nDocument Text:\n{context}\n",
            input_variables=["context"],
            partial_variables={"format_instructions": parser.get_format_instructions()},
        )
        
        chain = prompt | llm | parser
        guide = chain.invoke({"context": context})
        return guide
        
    except Exception as e:
        print(f"Study Guide Error: {str(e)}") 
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)