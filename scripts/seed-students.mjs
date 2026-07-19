import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openStore } from '../server/store.js'
import { hashPassword, normalizeIdentifier } from '../server/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year']
const SECTIONS = ['A', 'B', 'C', 'D', 'E']
const STUDENTS_PER_SECTION = 50
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

function loadEnv() {
  const envPath = path.join(rootDir, '.env')
  if (!fs.existsSync(envPath)) return
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    let key
    let value
    if (trimmed.startsWith('$env:')) {
      const m = trimmed.match(/^\$env:(\w+)=(?:"([^"]*)"|'([^']*)'|(.*))$/)
      if (m) {
        key = m[1]
        value = m[2] ?? m[3] ?? m[4] ?? ''
      }
    } else {
      const idx = trimmed.indexOf('=')
      if (idx !== -1) {
        key = trimmed.slice(0, idx).trim()
        value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
      }
    }
    if (key) process.env[key] = value
  }
}

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

function buildStudentPayload(sequence, yearIdx, sectionLetter) {
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
  const password = DEFAULT_PASSWORD
  const confirmPassword = DEFAULT_PASSWORD

  const dobYear = 2002 + (yearIdx % 4)
  const dobMonth = ((sequence % 12) + 1).toString().padStart(2, '0')
  const dobDay = (((sequence % 28) + 1)).toString().padStart(2, '0')
  const dateOfBirth = `${dobYear}-${dobMonth}-${dobDay}`
  const gender = ['Male', 'Female', 'Non-binary'][sequence % 3]
  const phone = `09${pad(100000000 + sequence, 9)}`
  const address = `${pick(STREETS, sequence + 3)}, ${pick(CITIES, sequence + 5)}, Camarines Sur`

  return {
    // Credentials and identity
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

    // Academic
    program,
    yearLevel,
    classSection,
    studentType,
    enrollmentStatus: 'Enrolled',
  }
}

async function seedStudents() {
  loadEnv()
  const store = await openStore()

  const existingStudents = await store.listAdminStudents({})
  if (existingStudents.length > 0) {
    console.log(`Existing students before seed: ${existingStudents.length}`)
  }

  const passwordHash = hashPassword(DEFAULT_PASSWORD)
  const createdAtIso = new Date().toISOString()

  let created = 0
  let skipped = 0
  let sequence = 0

  for (let yearIdx = 0; yearIdx < YEAR_LEVELS.length; yearIdx++) {
    for (const section of SECTIONS) {
      for (let i = 0; i < STUDENTS_PER_SECTION; i++) {
        const s = buildStudentPayload(sequence, yearIdx, section)
        sequence++

        // Mirror "Confirm Password" requirement in generated source data
        if (s.password !== s.confirmPassword) {
          throw new Error(`Password confirmation mismatch for ${s.studentId}`)
        }

        const dup = await store.findStudentDuplicate(
          normalizeIdentifier(s.studentId),
          normalizeIdentifier(s.email),
        )
        if (dup) {
          skipped++
          continue
        }

        await store.createUser({
          role: 'student',
          identifier: normalizeIdentifier(s.studentId),
          fullName: `${s.firstName} ${s.middleName} ${s.lastName}`,
          passwordHash,
          enable2FA: false,
          backupCode: null,
          createdAtIso,
          classSection: s.classSection,
          studentType: s.studentType,
          studentIdStored: s.studentId,
          emailStored: normalizeIdentifier(s.email),
          personalInformation: {
            first_name: s.firstName,
            middle_name: s.middleName,
            last_name: s.lastName,
            phone: s.phone,
            date_of_birth: s.dateOfBirth,
            gender: s.gender,
            address: s.address,
          },
          academicInfo: {
            program: s.program,
            year_level: s.yearLevel,
            enrollment_status: s.enrollmentStatus,
          },
          academicHistory: [],
          non_academic_activities: [],
          violations: [],
          skills: [],
          affiliations: [],
        })
        created++
      }
    }
  }

  const totalTarget = YEAR_LEVELS.length * SECTIONS.length * STUDENTS_PER_SECTION
  const afterStudents = await store.listAdminStudents({})
  console.log(`Target students: ${totalTarget}`)
  console.log(`Created this run: ${created}`)
  console.log(`Skipped duplicates: ${skipped}`)
  console.log(`Total students now: ${afterStudents.length}`)
  console.log(`Default seeded password: ${DEFAULT_PASSWORD}`)
}

seedStudents().catch((err) => {
  console.error('Student seeding failed:', err)
  process.exit(1)
})
