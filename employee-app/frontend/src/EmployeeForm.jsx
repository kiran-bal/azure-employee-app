import { useState } from 'react'

export default function EmployeeForm({ employee, onSave, onCancel }) {
  const [name, setName] = useState(employee ? employee.employee_name : '')
  const [email, setEmail] = useState(employee ? employee.email : '')
  const [department, setDepartment] = useState(employee ? employee.department : '')
  const [photo, setPhoto] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({ employee_name: name.trim(), email: email.trim(), department: department.trim() }, photo)
      if (!employee) {
        setName('')
        setEmail('')
        setDepartment('')
        setPhoto(null)
        event.target.reset()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>{employee ? `Edit ${employee.employee_name}` : 'Add employee'}</h2>
      {error && <p className="error">{error}</p>}

      <div className="fields">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required />
        </label>
        <label>
          Department
          <input value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={100} required />
        </label>
        <label>
          Profile picture
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0] || null)} />
        </label>
      </div>

      <div className="actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : employee ? 'Update' : 'Add employee'}
        </button>
        {employee && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
