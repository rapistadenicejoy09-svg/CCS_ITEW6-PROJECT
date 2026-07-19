import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const outputPath = path.join(rootDir, 'students-1000.json')

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year']
const SECTIONS = ['A', 'B', 'C', 'D', 'E']
const STUDENTS_PER_SECTION = 50

const FIRST_NAMES = [
  'Alden', 'Bianca', 'Carlo', 'Diana', 'Ethan', 'Faith', 'Gabriel', 'Hannah', 'Ivan', 'Janelle',
  'Kyle', 'Lara', 'Mico', 'Nina', 'Oscar', 'Paula', 'Quentin', 'Rhea', 'Sean', 'Trisha',
  'Ulysses', 'Vina', 'Warren', 'Xenia', 'Ysa', 'Zach',
]
const MIDDLE_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Dela Cruz', 'Garcia', 'Mendoza', 'Torres', 'Villanueva', 'Ramos', 'Flores',
  'Navarro', 'Domingo', 'Castro', 'Aquino', 'Lopez', 'Gonzales',
]
const LAST_NAMES = [
  'Abad', 'Bautista', 'Castillo', 'Delos Reyes', 'Escobar', 'Fernandez', 'Gutierrez', 'Hernandez', 'Ignacio', 'Jimenez',
  'Lazaro', 'Martinez', 'Natividad', 'Ortega', 'Pascual', 'Quijano', 'Rivera', 'Salazar', 'Tan', 'Uy',
  'Valdez', 'Yap', 'Zamora',
]
const STREETS = [
  'Mabini St.', 'Rizal Ave.', 'Bonifacio Rd.', 'Luna Ext.', 'Aguinaldo Highway', 'Sampaguita St.', 'Acacia Lane',
]
const CITIES = [
  'Naga City', 'Legazpi City', 'Daet', 'Iriga City', 'Sorsogon City', 'Tabaco City',
]

function pad(num, len = 4) {
  return String(num).padStart(len, '0')
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

function pick(arr, index) {
  return arr[index % arr.length]
}

function buildStudentDoc(sequence, yearIdx, sectionLetter) {
  const firstName = pick(FIRST_NAMES, sequence)
  const middleName = pick(MIDDLE_NAMES, sequence + 7)
  const lastName = pick(LAST_NAMES, sequence + 13)
  const yearLevel = YEAR_LEVELS[yearIdx]
  const yearNumber = yearIdx + 1
  const classSection = `${yearNumber}${sectionLetter}`
  const program = sequence % 2 === 0 ? 'CS' : 'IT'
  const studentType = sequence % 9 === 0 ? 'irregular' : 'regular'

  const studentId = `2026-${pad(sequence + 1, 6)}`
  const email = `${slug(firstName)}.${slug(lastName)}.${pad(sequence + 1, 4)}@ccs.edu.ph`
  const password = 'Student123!'
  const confirmPassword = 'Student123!'

  const dobYear = 2002 + (yearIdx % 4)
  const dobMonth = ((sequence % 12) + 1).toString().padStart(2, '0')
  const dobDay = ((sequence % 28) + 1).toString().padStart(2, '0')
  const dateOfBirth = `${dobYear}-${dobMonth}-${dobDay}`
  const gender = ['Male', 'Female', 'Non-binary'][sequence % 3]
  const phone = `09${pad(100000000 + sequence, 9)}`
  const address = `${pick(STREETS, sequence + 3)}, ${pick(CITIES, sequence + 5)}, Camarines Sur`

  return {
    firstName,
    middleName,
    lastName,
    studentId,
    email,
    password,
    confirmPassword,
    phone,
    dateOfBirth,
    gender,
    address,
    program,
    yearLevel,
    section: classSection,
    type: studentType,
    enrollmentStatus: 'Enrolled',
    // Also include ready-to-use nested shapes that mirror app payload structure:
    personalInformation: {
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      phone,
      date_of_birth: dateOfBirth,
      gender,
      address,
    },
    academicInfo: {
      program,
      year_level: yearLevel,
      enrollment_status: 'Enrolled',
    },
    classSection,
    studentType,
  }
}

function generateStudents() {
  const docs = []
  let sequence = 0
  for (let yearIdx = 0; yearIdx < YEAR_LEVELS.length; yearIdx++) {
    for (const section of SECTIONS) {
      for (let i = 0; i < STUDENTS_PER_SECTION; i++) {
        docs.push(buildStudentDoc(sequence, yearIdx, section))
        sequence++
      }
    }
  }
  return docs
}

const students = generateStudents()
fs.writeFileSync(outputPath, JSON.stringify(students, null, 2), 'utf8')

console.log(`Generated ${students.length} students.`)
console.log(`Saved to: ${outputPath}`)
