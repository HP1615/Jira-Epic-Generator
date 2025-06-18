import React, { useState } from "react";
import axios from "axios";

// --- Styles ---
const mainContainer = {
  background: "#f4f6fb",
  minHeight: "100vh",
  padding: "0",
  fontFamily: "Segoe UI, Arial, sans-serif"
};

const headerStyle = {
  textAlign: "center",
  marginTop: 32,
  marginBottom: 8,
  color: "#253858",
  fontWeight: 700,
  fontSize: 36,
  letterSpacing: 0.5
};

const subHeaderStyle = {
  textAlign: "center",
  marginBottom: 18,
  color: "#6b778c",
  fontWeight: 400,
  fontSize: 18
};

const cardStyle = {
  background: "#fff",
  borderRadius: 10,
  boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
  padding: 32,
  margin: "0 auto",
  maxWidth: 500
};

const inputStyle = {
  width: "100%",
  padding: "10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 15,
  marginTop: 4,
  marginBottom: 12,
  background: "#f9fafb",
};

const labelStyle = {
  fontWeight: 500,
  color: "#22223b",
  display: "block",
  marginBottom: 2,
};

const buttonStyle = {
  padding: "7px 18px",
  fontSize: 15,
  background: "#0052cc",
  color: "#fff",
  border: "none",
  borderRadius: 5,
  cursor: "pointer",
  marginRight: 10,
  marginTop: 8,
  transition: "background 0.2s",
};

const buttonGreen = {
  ...buttonStyle,
  background: "#28a745",
};

const disabledButton = {
  ...buttonStyle,
  background: "#bdbdbd",
  cursor: "not-allowed",
};

const EpicGenerator = () => {
  const [ticketIds, setTicketIds] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [epic, setEpic] = useState("");
  const [jiraEpicUrl, setJiraEpicUrl] = useState("");
  const [error, setError] = useState("");
  const [sourceTickets, setSourceTickets] = useState([]);
  const [creatingEpic, setCreatingEpic] = useState(false);

  // Step 1: Generate Epic (preview only)
  const handleGenerateEpic = async (e) => {
    e.preventDefault();
    setLoading(true);
    setEpic("");
    setJiraEpicUrl("");
    setError("");
    setSourceTickets([]);
    try {
      const response = await axios.post(
        "http://localhost:5000/generate-epic",
        {
          ticketIds: ticketIds
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id),
          keywordInput,
          customPrompt,
        }
      );
      setEpic(response.data.epic);
      setSourceTickets(response.data.sourceTickets || []);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Failed to generate Epic. Please check your input and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Create Epic in Jira (after preview)
  const handleCreateEpic = async () => {
    setCreatingEpic(true);
    setJiraEpicUrl("");
    setError("");
    try {
      const response = await axios.post(
        "http://localhost:5000/create-epic",
        {
          epicContent: epic,
          ticketIds: sourceTickets.map((t) => t.id),
        }
      );
      setJiraEpicUrl(response.data.jiraEpicUrl);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Failed to create Epic in Jira. Please try again."
      );
    } finally {
      setCreatingEpic(false);
    }
  };

  return (
    <div style={mainContainer}>
      <div style={cardStyle}>
        <form onSubmit={handleGenerateEpic} style={{ marginBottom: 24 }}>
          <label style={labelStyle}>
            Ticket IDs (comma separated):
            <input
              type="text"
              value={ticketIds}
              onChange={(e) => setTicketIds(e.target.value)}
              placeholder="e.g. PROJ-123, PROJ-456"
              style={inputStyle}
              required={!keywordInput}
            />
          </label>
          <label style={labelStyle}>
            Keyword Input (searches existing tickets):
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="Enter keyword to search tickets"
              style={inputStyle}
              required={!ticketIds}
            />
          </label>
          <label style={labelStyle}>
            Additional Instructions (optional):
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Any extra instructions for the Epic generation"
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
            />
          </label>
          <button
            type="submit"
            disabled={loading || (!ticketIds && !keywordInput)}
            style={
              loading || (!ticketIds && !keywordInput)
                ? disabledButton
                : buttonStyle
            }
          >
            {loading ? "Generating..." : "Generate Epic"}
          </button>
        </form>

        {error && (
          <div
            style={{
              color: "#b91c1c",
              background: "#fdecea",
              border: "1px solid #f5c2c7",
              borderRadius: 6,
              padding: "10px 16px",
              marginBottom: 18,
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        {epic && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ color: "#22223b", marginBottom: 10 }}>Epic Preview</h3>
            <pre
              style={{
                background: "#f4f4f4",
                padding: 18,
                borderRadius: 6,
                whiteSpace: "pre-wrap",
                fontSize: 15,
                lineHeight: 1.6,
                border: "1px solid #e0e0e0",
                marginBottom: 10,
              }}
            >
              {epic}
            </pre>
            <button
              onClick={handleCreateEpic}
              disabled={creatingEpic}
              style={creatingEpic ? disabledButton : buttonGreen}
            >
              {creatingEpic ? "Creating Epic in Jira..." : "Import Epic in Jira"}
            </button>
            {jiraEpicUrl && (
              <div style={{ marginTop: 16 }}>
                <a
                  href={jiraEpicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "#0052cc",
                    fontWeight: "bold",
                    textDecoration: "none",
                    fontSize: 16,
                  }}
                >
                  View Epic in Jira
                </a>
              </div>
            )}
          </div>
        )}

        {sourceTickets.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h4 style={{ color: "#22223b", marginBottom: 8 }}>Source Tickets Used</h4>
            <ul style={{ paddingLeft: 18, fontSize: 15 }}>
              {sourceTickets.map((t) => (
                <li key={t.id} style={{ marginBottom: 3 }}>
                  <strong>{t.id}</strong>: {t.summary}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <footer style={{ textAlign: "center", color: "#bdbdbd", marginTop: 40, fontSize: 14 }}>
        &copy; {new Date().getFullYear()} Jira Epic Generator
      </footer>
    </div>
  );
};

export default EpicGenerator;