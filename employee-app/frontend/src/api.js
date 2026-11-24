const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// The serverless database pauses when idle and needs up to a minute to resume.
// While it starts, the API answers 503 (or the request fails), so retry a few times.
const RETRIES = 6
const RETRY_DELAY_MS = 10000

async function request(path, options, onWaiting) {
  let response
  for (let attempt = 1; ; attempt++) {
    try {
      response = await fetch(`${API_URL}${path}`, options)
      if (response.status !== 503) break
    } catch (err) {
      // only repeat reads after a network error; a write may already have been saved
      const isRead = !options || !options.method || options.method === 'GET'
      if (!isRead || attempt >= RETRIES) throw new Error('Cannot reach the server. Please try again later.')
    }
    if (attempt >= RETRIES) break
    if (onWaiting) onWaiting()
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }
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

export const getEmployees = (onWaiting) => request('/api/employees', undefined, onWaiting)
export const createEmployee = (data) => request('/api/employees', jsonOptions('POST', data))
export const updateEmployee = (id, data) => request(`/api/employees/${id}`, jsonOptions('PUT', data))
export const deleteEmployee = (id) => request(`/api/employees/${id}`, { method: 'DELETE' })
export const uploadPhoto = (id, file) => request(`/api/employees/${id}/photo`, fileOptions(file))
export const getDocuments = (id) => request(`/api/employees/${id}/documents`)
export const uploadDocument = (id, file) => request(`/api/employees/${id}/documents`, fileOptions(file))
