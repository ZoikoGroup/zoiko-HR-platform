export function getProfile() {
  return {
    name: "John Doe",
    email: "john.doe@company.com",
    phone: "+1 (555) 123-4567",
    address: "123 Main St, New York, NY 10001",
    workEmail: "john.doe@company.com",
    workPhone: "+1 (555) 987-6543",
    jobTitle: "Senior Software Engineer",
    employeeId: "ZO0001",
    joinDate: "2020-03-15",
    department: "Engineering",
    bloodGroup: "O+",
    manager: "Jane Smith",
    emergencyContacts: [
      { id: 1, name: "Jane Doe", relationship: "Spouse", phone: "+1 (555) 222-3333", email: "jane.doe@email.com" },
      { id: 2, name: "Bob Johnson", relationship: "Father", phone: "+1 (555) 444-5555", email: "bob.j@email.com" },
    ],
  };
}
