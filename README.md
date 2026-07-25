# DocuMind AI 🧠📄

DocuMind AI is a powerful, full-stack Retrieval-Augmented Generation (RAG) web application built to analyze complex PDF documents (such as financial reports, handbooks, and research papers). It features conversational memory, strict document-only querying, an automated web-search fallback toggle, and instant study guide/quiz generation.

---

## 🚀 Key Features

* **Advanced PDF Ingestion & Parsing (`LlamaParse`):** Extracts clean text and handles complex markdown structures and tables from uploaded PDFs.
* **Conversational Chat with Memory:** Powered by LangChain history-aware retrievers, allowing you to ask follow-up questions contextually.
* **Interactive Source Page Navigation:** Every AI response includes clickable source badges (`Page X`) that instantly let you jump to the relevant section in your document.
* **Controlled Web Search Fallback (`Tavily`):** Intelligently detects when an answer is missing from the document using a secret trigger code (`TRIGGER_WEB_SEARCH`) and falls back to live web data if needed.
* **Automated Study Guide & Quiz Generator:** Instantly parses document text to generate structured summaries, key takeaways, and interactive quizzes via Pydantic JSON parsing.
* **Persistent Vector Storage (`ChromaDB`):** Efficiently embeds and retrieves document segments using Mistral AI embeddings.

---

## 🛠️ Tech Stack

* **Frontend:** React, Vite, Tailwind CSS, Axios
* **Backend:** FastAPI, Python, Uvicorn, Pydantic
* **AI & Orchestration:** LangChain, Mistral AI (`mistral-small-latest`), LlamaParse
* **Database & Search:** ChromaDB, Tavily Search API, Supabase

---

## ⚙️ Prerequisites & Environment Setup

Make sure you have Python (version 3.10+) and Node.js installed on your machine.

### 1. Clone the Repository :

```bash

git clone [https://github.com/YOUR_USERNAME/pdf-rag-app.git](https://github.com/YOUR_USERNAME/pdf-rag-app.git)
cd pdf-rag-app

2. Setup the Backend Environment :

Create a .env file inside the backend/ directory and add your API keys:

Code snippet : 

LLAMA_CLOUD_API_KEY=your_llama_cloud_api_key_here
MISTRAL_API_KEY=your_mistral_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here

3. Install Backend Dependencies :

Navigate to the backend directory and install the required packages:

```Bash
cd backend
pip install -r requirements.txt


4. Install Frontend Dependencies :
Open a separate terminal window, navigate to the frontend directory, and install packages:

```Bash
cd frontend
npm install

🏃‍♂️ Running the Project Locally :
Start the Backend Server run the command in new terminal --

```Bash
uvicorn main:app --reload
The FastAPI backend will run locally at http://127.0.0.1:8000.

Start the Frontend Development Server :

From your frontend folder, run :

```Bash
npm run dev
Open the provided -- http://localhost:5173 link in your browser to use DocuMind AI.

📡 API Endpoints Overview :

GET /: Health check to verify API status.

POST /upload: Uploads and parses a PDF file using LlamaParse and builds the vector embeddings.

POST /chat: Processes user queries with context history and returns text answers along with page-level source tracking.

POST /study-guide: Generates a structured JSON summary, key takeaways, and practice quiz questions based on the uploaded document.

📄 License
This project is open-source and available under the MIT License.
