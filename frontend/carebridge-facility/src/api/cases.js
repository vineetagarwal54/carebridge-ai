import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

export async function fetchCases() {
  const response = await apiClient.get("/cases");
  return response.data;
}

export async function getCase(caseId) {
  const response = await apiClient.get(`/cases/${caseId}`);
  return response.data; // PatientCaseResponse including extraction_data
}

export async function createCase(payload) {
  const response = await apiClient.post("/cases", payload);
  return response.data;
}

export async function uploadDocument(caseId, file) {
  const form = new FormData();
  form.append("file", file);
  const response = await axios.post(
    `${API_BASE_URL}/cases/${caseId}/documents`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;
}

export async function extractCase(caseId) {
  const response = await apiClient.post(`/cases/${caseId}/extract`);
  return response.data;
}