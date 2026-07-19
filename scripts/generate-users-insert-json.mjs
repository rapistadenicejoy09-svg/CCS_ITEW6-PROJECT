import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcrypt'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const BATCH_TAG = process.env.STUDENT_BATCH_TAG || 'b2'
const outputPath = path.join(rootDir, `students-1000-users-insert-${BATCH_TAG}.json`)
const STUDENT_ID_START = Number(process.env.STUDENT_ID_START || 3000001)

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year']
const SECTIONS = ['A', 'B', 'C', 'D', 'E']
const STUDENTS_PER_SECTION = 50
const STARTING_ID = 10001
const DEFAULT_PASSWORD = 'Student123!'

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

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase()
}

function buildStudentDoc(sequence, yearIdx, sectionLetter, passwordHash) {
  const firstName = pick(FIRST_NAMES, sequence)
  const middleName = pick(MIDDLE_NAMES, sequence + 7)
  const lastName = pick(LAST_NAMES, sequence + 13)
  const fullName = `${firstName} ${middleName} ${lastName}`
  const yearLevel = YEAR_LEVELS[yearIdx]
  const yearNumber = yearIdx + 1
  const classSection = `${yearNumber}${sectionLetter}`
  const program = sequence % 2 === 0 ? 'CS' : 'IT'
  const studentType = sequence % 9 === 0 ? 'irregular' : 'regular'

  const ordinal = sequence + 1
  const id = STARTING_ID + sequence + 10000
  const studentIdNum = STUDENT_ID_START + sequence
  const studentId = String(studentIdNum)
  if (!/^\d{7}$/.test(studentId)) {
    throw new Error(`Generated student_id is not 7 digits: ${studentId}`)
  }
  const identifier = normalizeIdentifier(studentId)
  const email = `${slug(firstName)}.${slug(lastName)}.${pad(ordinal, 4)}.${BATCH_TAG}@ccs.edu.ph`
  const createdAt = `2026-04-${String((sequence % 28) + 1).padStart(2, '0')}T08:00:00.000Z`

  const dobYear = 2002 + (yearIdx % 4)
  const dobMonth = ((sequence % 12) + 1).toString().padStart(2, '0')
  const dobDay = ((sequence % 28) + 1).toString().padStart(2, '0')
  const dateOfBirth = `${dobYear}-${dobMonth}-${dobDay}`
  const gender = ['Male', 'Female', 'Non-binary'][sequence % 3]
  const phone = `09${pad(100000000 + sequence, 9)}`
  const address = `${pick(STREETS, sequence + 3)}, ${pick(CITIES, sequence + 5)}, Camarines Sur`

  return {
    id,
    class_section: classSection,
    created_at: createdAt,
    email,
    full_name: fullName,
    identifier,
    is_active: 1,
    password_hash: passwordHash,
    role: 'student',
    student_id: studentId,
    student_id_norm: identifier,
    student_type: studentType,
    twofa_backup_code: null,
    twofa_enabled: 0,
    twofa_secret: null,
    academic_history: [],
    affiliations: [],
    non_academic_activities: [],
    personal_information: {
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      phone,
      date_of_birth: dateOfBirth,
      gender,
      address,
    },
    skills: [],
    violations: [],
    academic_info: {
      program,
      year_level: yearLevel,
      enrollment_status: 'Enrolled',
    },
    profile_image_url: null,
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
  }
}

function generateStudents(passwordHash) {
  const docs = []
  let sequence = 0
  for (let yearIdx = 0; yearIdx < YEAR_LEVELS.length; yearIdx++) {
    for (const section of SECTIONS) {
      for (let i = 0; i < STUDENTS_PER_SECTION; i++) {
        docs.push(buildStudentDoc(sequence, yearIdx, section, passwordHash))
        sequence++
      }
    }
  }
  return docs
}

const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10)
const students = generateStudents(passwordHash)

fs.writeFileSync(outputPath, JSON.stringify(students, null, 2), 'utf8')

console.log(`Generated ${students.length} users documents.`)
console.log(`Saved to: ${outputPath}`)
console.log(`Default password for all seeded users: ${DEFAULT_PASSWORD}`)
console.log(`Batch tag: ${BATCH_TAG}`)
console.log(`Student ID range: ${STUDENT_ID_START} - ${STUDENT_ID_START + students.length - 1}`)
