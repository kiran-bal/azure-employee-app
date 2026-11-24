import { useEffect, useState } from 'react'
import * as api from './api'
import EmployeeForm from './EmployeeForm.jsx'
import EmployeeList from './EmployeeList.jsx'

export default function App() {
  const [employees, setEmployees] = useState([])
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [waking, setWaking] = useState(false)

  async function loadEmployees() {
    try {
      setEmployees(await api.getEmployees(() => setWaking(true)))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setWaking(false)
    }
  }

  useEffect(() => {
    loadEmployees()
  }, [])

  async function handleSave(details, photo) {
    // 1. save the details in the database  2. upload the picture for that employee
    const saved = editing
      ? await api.updateEmployee(editing.employee_id, details)
      : await api.createEmployee(details)
    try {
      if (photo) await api.uploadPhoto(saved.employee_id, photo)
    } finally {
      setEditing(null)
      await loadEmployees()
    }
  }

  async function handleDelete(employee) {
    if (!window.confirm(`Delete ${employee.employee_name}?`)) return
    try {
      await api.deleteEmployee(employee.employee_id)
      if (editing && editing.employee_id === employee.employee_id) setEditing(null)
      await loadEmployees()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="page">
      <h1>Employee Management</h1>
      {error && <p className="error">{error}</p>}

      <EmployeeForm
        key={editing ? editing.employee_id : 'new'}
        employee={editing}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
      />

      {loading ? (
        <p>{waking ? 'Starting the database, this can take up to a minute...' : 'Loading employees...'}</p>
      ) : (
        <EmployeeList employees={employees} onEdit={setEditing} onDelete={handleDelete} />
      )}
    </div>
  )
}
