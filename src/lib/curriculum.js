export const COURSE_OPTIONS = ['BSIT', 'BSCS']
export const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year']
export const SEMESTER_OPTIONS = ['1st Semester', '2nd Semester']

export const SUBJECT_CATALOG = {
  'BSIT': {
    '1st Year': {
      '1st Semester': [
        { code: 'CCS101', name: 'Introduction to Computing' },
        { code: 'CCS102', name: 'Computer Programming 1' },
        { code: 'ETH101', name: 'Ethics' },
        { code: 'MAT101', name: 'Mathematics in the Modern World' },
        { code: 'NSTP1', name: 'National Service Training Program 1' },
        { code: 'PED101', name: 'Physical Education 1' },
        { code: 'PSY100', name: 'Understanding the Self' },
      ],
      '2nd Semester': [
        { code: 'CCS103', name: 'Computer Programming 2' },
        { code: 'CCS104', name: 'Discrete Structures 1' },
        { code: 'CCS105', name: 'Human Computer Interaction 1' },
        { code: 'CCS106', name: 'Social and Professional Issues' },
        { code: 'COM101', name: 'Purposive Communication' },
        { code: 'GAD101', name: 'Gender and Development' },
        { code: 'NSTP2', name: 'National Service Training Program 2' },
        { code: 'PED102', name: 'Physical Education 2' },
      ]
    },
    '2nd Year': {
      '1st Semester': [
        { code: 'ACT101', name: 'Principles of Accounting' },
        { code: 'CCS107', name: 'Data Structures and Algorithms 1' },
        { code: 'CCS108', name: 'Object-Oriented Programming' },
        { code: 'CCS109', name: 'System Analysis and Design' },
        { code: 'ITEW1', name: 'Electronic Commerce' },
        { code: 'PED103', name: 'Physical Education 3' },
        { code: 'STS101', name: 'Science, Technology and Society' },
      ],
      '2nd Semester': [
        { code: 'CCS110', name: 'Information Management 1' },
        { code: 'CCS111', name: 'Networking and Communication 1' },
        { code: 'ENT101', name: 'The Entrepreneurial Mind' },
        { code: 'ITEW2', name: 'Client Side Scripting' },
        { code: 'ITP101', name: 'Quantitative Methods' },
        { code: 'ITP102', name: 'Integrative Programming and Technologies' },
        { code: 'PED104', name: 'Physical Education 4' },
      ]
    },
    '3rd Year': {
      '1st Semester': [
        { code: 'HIS101', name: 'Readings in Philippine History' },
        { code: 'ITEW3', name: 'Server Side Scripting' },
        { code: 'ITP103', name: 'System Integration and Architecture' },
        { code: 'ITP104', name: 'Information Management 2' },
        { code: 'ITP105', name: 'Networking and Communication 2' },
        { code: 'ITP106', name: 'Human Computer Interaction 2' },
        { code: 'SOC101', name: 'The Contemporary World' },
        { code: 'TEC101', name: 'Technopreneurship' },
      ],
      '2nd Semester': [
        { code: 'CCS112', name: 'Applications Development and Emerging Technologies' },
        { code: 'CCS113', name: 'Information Assurance and Security' },
        { code: 'HMN101', name: 'Art Appreciation' },
        { code: 'ITEW4', name: 'Responsive Web Design' },
        { code: 'ITP107', name: 'Mobile Application Development' },
        { code: 'ITP108', name: 'Capstone Project 1' },
      ]
    },
    '4th Year': {
      '1st Semester': [
        { code: 'ENV101', name: 'Environmental Science' },
        { code: 'ITEW5', name: 'Web Security and Optimization' },
        { code: 'ITP110', name: 'Web Technologies' },
        { code: 'ITP111', name: 'System Administration and Maintenance' },
        { code: 'ITP112', name: 'Capstone Project 2' },
        { code: 'RIZ101', name: 'Life and Works of Rizal' },
      ],
      '2nd Semester': [
        { code: 'ITEW6', name: 'Web Development Frameworks' },
        { code: 'ITP113', name: 'IT Practicum (500 hours)' },
      ]
    }
  },
  'BSCS': {
    '1st Year': {
      '1st Semester': [
        { code: 'CCS101', name: 'Introduction to Computing' },
        { code: 'CCS102', name: 'Computer Programming 1' },
        { code: 'ETH101', name: 'Ethics' },
        { code: 'MAT101', name: 'Mathematics in the Modern World' },
        { code: 'NSTP1', name: 'National Service Training Program 1' },
        { code: 'PED101', name: 'Physical Education 1' },
        { code: 'PSY100', name: 'Understanding the Self' },
      ],
      '2nd Semester': [
        { code: 'CCS103', name: 'Computer Programming 2' },
        { code: 'CCS104', name: 'Discrete Structures 1' },
        { code: 'CCS106', name: 'Social and Professional Issues' },
        { code: 'COM101', name: 'Purposive Communication' },
        { code: 'CSP101', name: 'Analytic Geometry' },
        { code: 'GAD101', name: 'Gender and Development' },
        { code: 'NSTP2', name: 'National Service Training Program 2' },
        { code: 'PED102', name: 'Physical Education 2' },
      ]
    },
    '2nd Year': {
      '1st Semester': [
        { code: 'CCS107', name: 'Data Structures and Algorithms 1' },
        { code: 'CCS108', name: 'Object-Oriented Programming' },
        { code: 'CSEG1', name: 'Game Concepts and Productions' },
        { code: 'CSP102', name: 'Discrete Structures 2' },
        { code: 'HIS101', name: 'Readings in Philippine History' },
        { code: 'PED103', name: 'Physical Education 3' },
        { code: 'STS101', name: 'Science, Technology and Society' },
      ],
      '2nd Semester': [
        { code: 'ACT101', name: 'Principles of Accounting' },
        { code: 'CCS110', name: 'Information Management 1' },
        { code: 'CSEG2', name: 'Game Programming 1' },
        { code: 'CSP103', name: 'Data Structures and Algorithms 2' },
        { code: 'CSP104', name: 'Calculus' },
        { code: 'CSP105', name: 'Algorithms and Complexity' },
        { code: 'HMN101', name: 'Art Appreciation' },
        { code: 'PED104', name: 'Physical Education 4' },
      ]
    },
    '3rd Year': {
      '1st Semester': [
        { code: 'CCS109', name: 'System Analysis and Design' },
        { code: 'CCS112', name: 'Applications Development and Emerging Technologies' },
        { code: 'CCS113', name: 'Information Assurance Security' },
        { code: 'CSEG3', name: 'Game Programming 2' },
        { code: 'CSP106', name: 'Automata Theory and Formal Languages' },
        { code: 'CSP107', name: 'Computer Organization and Assembly Language Programming' },
        { code: 'ENT101', name: 'The Entrepreneurial Mind' },
      ],
      '2nd Semester': [
        { code: 'CSEG4', name: 'Game Programming 3 (Pure Labs)' },
        { code: 'CSP108', name: 'Programming Languages' },
        { code: 'CSP109', name: 'Software Engineering 1' },
        { code: 'CSP110', name: 'Numerical Analysis' },
        { code: 'CSP111', name: 'Thesis 1' },
        { code: 'RIZ101', name: 'Life and Works of Rizal' },
        { code: 'SOC101', name: 'The Contemporary World' },
        { code: 'TEC101', name: 'Technopreneurship' },
      ]
    },
    '4th Year': {
      '1st Semester': [
        { code: 'CCS105', name: 'Human Computer Interaction 1' },
        { code: 'CSEG5', name: 'Artificial Intelligence for Games' },
        { code: 'CSP112', name: 'Operating Systems' },
        { code: 'CSP113', name: 'Software Engineering 2' },
        { code: 'CSP114', name: 'Thesis 2' },
        { code: 'ENV101', name: 'Environmental Science' },
      ],
      '2nd Semester': [
        { code: 'CCS111', name: 'Networking and Communication 1' },
        { code: 'CSEG6', name: 'Advance Game Design' },
        { code: 'CSP115', name: 'CS Practicum (300 hours)' },
      ]
    }
  }
}

export function getExpectedCodes(course, year, sem) {
  let codes = new Set();
  const courses = course === 'All' ? Object.keys(SUBJECT_CATALOG) : [course];
  for (const c of courses) {
    if (!SUBJECT_CATALOG[c]) continue;
    const years = year === 'All' ? Object.keys(SUBJECT_CATALOG[c]) : [year];
    for (const y of years) {
      if (!SUBJECT_CATALOG[c][y]) continue;
      const sems = sem === 'All' ? Object.keys(SUBJECT_CATALOG[c][y]) : [sem];
      for (const s of sems) {
         if (!SUBJECT_CATALOG[c][y][s]) continue;
         for (const sub of SUBJECT_CATALOG[c][y][s]) {
            codes.add(sub.code.toLowerCase());
         }
      }
    }
  }
  return codes;
}
