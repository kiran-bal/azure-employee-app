const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, options) {
  const response = await fetch(`${API_URL}${path}`, options)
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      if (typeof body.detail === 'string') message = body.detail
    } catch {
      // response had no JSON body
    }
    throw new Error(message)
  }
  return response.status === 204 ? null : response.json()
}

function jsonOptions(method, data) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }
}

function fileOptions(file) {
  const form = new FormData()
  form.append('file', file)
  return { method: 'POST', body: form }
}

export const getEmployees = () => request('/api/employees')
export const createEmployee = (data) => request('/api/employees', jsonOptions('POST', data))
export const updateEmployee = (id, data) => request(`/api/employees/${id}`, jsonOptions('PUT', data))
export const deleteEmployee = (id) => request(`/api/employees/${id}`, { method: 'DELETE' })
export const uploadPhoto = (id, file) => request(`/api/employees/${id}/photo`, fileOptions(file))
export const getDocuments = (id) => request(`/api/employees/${id}/documents`)
export const uploadDocument = (id, file) => request(`/api/employees/${id}/documents`, fileOptions(file))
