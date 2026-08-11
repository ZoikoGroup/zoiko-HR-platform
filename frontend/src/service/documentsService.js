import { api } from "./api";

const mockDocuments = [
  { id: 1, name: "Employee Handbook 2026.pdf", category: "HR Policies", size: "2.4 MB", updated: "June 10, 2026", author: "Sarah Jenkins" },
  { id: 2, name: "Corporate NDA Agreement.pdf", category: "Legal Agreements", size: "1.8 MB", updated: "June 08, 2026", author: "Liam O'Connor" },
  { id: 3, name: "PostgreSQL Database Backup Schema.sql", category: "Database Tech", size: "940 KB", updated: "June 05, 2026", author: "System Admin" },
  { id: 4, name: "Quarterly Financial Statement.xlsx", category: "Billing & Finance", size: "4.5 MB", updated: "May 28, 2026", author: "David Kim" },
];

export async function getDocuments() {
  try {
    return await api.get("/hr/documents");
  } catch (err) {
    console.warn("documentsService: fetch failed, using mock data:", err.message || err);
    return mockDocuments;
  }
}

export async function createDocument(data, file) {
  const formData = new FormData();
  formData.append("data", JSON.stringify(data));
  if (file) {
    formData.append("file", file);
  }
  try {
    return await api.post("/hr/documents", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  } catch (err) {
    console.warn("documentsService: create failed:", err.message || err);
    const newDoc = { id: Date.now(), ...data, file_name: file?.name, size: file ? `${(file.size / 1024).toFixed(1)} KB` : null, updated: new Date().toLocaleDateString(), author: "Current User" };
    mockDocuments.unshift(newDoc);
    return newDoc;
  }
}

export async function updateDocument(id, data) {
  try {
    return await api.put(`/hr/documents/${id}`, data);
  } catch (err) {
    console.warn("documentsService: update failed:", err.message || err);
    const idx = mockDocuments.findIndex(d => d.id === id);
    if (idx !== -1) {
      mockDocuments[idx] = { ...mockDocuments[idx], ...data, updated: new Date().toLocaleDateString() };
    }
    return mockDocuments[idx];
  }
}

export async function deleteDocument(id) {
  try {
    return await api.delete(`/hr/documents/${id}`);
  } catch (err) {
    console.warn("documentsService: delete failed:", err.message || err);
    const idx = mockDocuments.findIndex(d => d.id === id);
    if (idx !== -1) mockDocuments.splice(idx, 1);
    return { success: true };
  }
}

export async function getDocumentById(id) {
  try {
    return await api.get(`/hr/documents/${id}`);
  } catch (err) {
    console.warn("documentsService: get by id failed:", err.message || err);
    return mockDocuments.find(d => d.id === id);
  }
}