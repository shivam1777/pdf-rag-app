import React, { useState } from "react";
import axios from "axios";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [pdfUploaded, setPdfUploaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Handle PDF Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post("https://your-render-backend-url.onrender.com/upload", formData);
      alert(res.data.message);
      setPdfUploaded(true);
    } catch (err) {
      alert("Error uploading PDF");
    }
  };

  // Handle Chat Submit
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      // Format chat history for backend
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      
      const res = await axios.post("https://your-render-backend-url.onrender.com/chat", {
        question: userMessage.content,
        history: history,
      });

      const botMessage = {
        role: "bot",
        content: res.data.answer,
        sources: res.data.sources || [],
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "bot", content: "Error connecting to server." }]);
    }
  };

  // Function to handle clicking a source page badge
  const scrollToPage = (pageNum) => {
    setCurrentPage(pageNum);
    console.log(`Jumping to PDF viewer page: ${pageNum}`);
    // Add your react-pdf scroll logic here if applicable
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <div className="w-80 bg-gray-950 p-4 border-r border-gray-800 flex flex-col justify-between">
        <div>
          <h1 className="text-xl font-bold text-emerald-400 mb-6">DocuMind AI</h1>
          <input type="file" accept=".pdf" onChange={handleFileUpload} className="mb-4 text-sm" />
          <p className="text-xs text-gray-400">
            {pdfUploaded ? "✅ PDF Ready for Queries" : "⚠️ Please upload a PDF first"}
          </p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col justify-between p-6">
        <div className="overflow-y-auto space-y-4 pr-2 flex-1">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg max-w-2xl ${
                msg.role === "user" ? "bg-emerald-600 ml-auto" : "bg-gray-800 mr-auto"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {/* --- CRITICAL SECTION: VISIBLE & CLICKABLE SOURCES --- */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-gray-700/50 text-xs">
                  <span className="font-semibold text-gray-400">SOURCES:</span>
                  {msg.sources.map((src, idx) => {
                    // Safe fallback for retrieving page numbers from backend response
                    const pageNum = src.page || src.pageNumber || src.page_num || 1;
                    return (
                      <button
                        key={idx}
                        onClick={() => scrollToPage(pageNum)}
                        className="bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded hover:bg-emerald-900 transition cursor-pointer font-medium"
                      >
                        Page {pageNum}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSendMessage} className="mt-4 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your uploaded PDF..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-lg font-medium transition"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
