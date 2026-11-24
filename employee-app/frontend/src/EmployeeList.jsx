import { useState } from 'react'
import Documents from './Documents.jsx'

export default function EmployeeList({ employees, onEdit, onDelete }) {
  const [openDocs, setOpenDocs] = useState(null)

  if (employees.length === 0) {
    return <p className="empty">No employees yet. Add the first one using the form above.</p>
  }

  return (
    <div className="list">
      {employees.map((employee) => (
        <div className="card employee" key={employee.employee_id}>
          <div className="employee-row">
            {employee.profile_image_url ? (
              <img className="avatar" src={employee.profile_image_url} alt={employee.employee_name} />
            ) : (
              <div className="avatar placeholder">{employee.employee_name.charAt(0).toUpperCase()}</div>
            )}

            <div className="employee-info">
              <strong>{employee.employee_name}</strong>
              <span>{employee.email}</span>
              <span className="department">{employee.department}</span>
            </div>

            <div className="actions">
              <button
                className="secondary"
                onClick={() => setOpenDocs(openDocs === employee.employee_id ? null : employee.employee_id)}
              >
                Documents
              </button>
              <button className="secondary" onClick={() => onEdit(employee)}>
                Edit
              </button>
              <button className="danger" onClick={() => onDelete(employee)}>
                Delete
              </button>
            </div>
          </div>

          {openDocs === employee.employee_id && <Documents employeeId={employee.employee_id} />}
        </div>
      ))}
    </div>
  )
}
