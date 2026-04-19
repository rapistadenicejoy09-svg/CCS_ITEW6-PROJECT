import speakeasy from 'speakeasy'

const PORT = Number(process.env.PORT || 5000)
const API_URL = process.env.API_URL || `http://localhost:${PORT}/api`
const TEST_USER = {
  role: 'student',
  studentId: 'teststudent2',
  email: 'teststudent2@example.com',
  password: 'securepassword123',
  fullName: 'Test Student 2',
}

let token = null
let twoFaSecret = null

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

async function runTests() {
  console.log('--- Starting Auth/RBAC Tests ---')
  
  // 1. Register User
  console.log('1. Registering user...')
  let res = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      role: TEST_USER.role,
      studentId: TEST_USER.studentId,
      email: TEST_USER.email,
      password: TEST_USER.password,
      fullName: TEST_USER.fullName,
    }),
  })
  if (res.status === 201 || res.status === 409) {
    console.log('   ✅ User registered (or already exists)')
  } else {
    console.error('   ❌ Registration failed', res)
  }

  // 2. Login
  console.log('2. Logging in...')
  res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: TEST_USER.email, password: TEST_USER.password }),
  })
  if (res.status === 200 && res.body.token) {
    token = res.body.token
    console.log('   ✅ Login successful')
  } else {
    console.error('   ❌ Login failed', res)
    return
  }

  // 3. RBAC Test
  console.log('3. Testing RBAC on /admin/users...')
  res = await request('/admin/users')
  if (res.status === 403) {
    console.log('   ✅ RBAC blocked unauthorized student role correctly')
  } else {
    console.error('   ❌ RBAC failed! Expected 403, got', res.status)
  }

  // 4. Setup 2FA
  console.log('4. Setting up 2FA...')
  res = await request('/auth/2fa/setup', { method: 'POST' })
  if (res.status === 200 && res.body.secret) {
    twoFaSecret = res.body.secret
    console.log('   ✅ 2FA Setup returned secret:', twoFaSecret)
  } else {
    console.error('   ❌ 2FA Setup failed', res)
  }

  // 5. Verify 2FA
  console.log('5. Verifying 2FA...')
  const code = speakeasy.totp({ secret: twoFaSecret, encoding: 'base32' })
  res = await request('/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ code })
  })
  if (res.status === 200) {
    console.log('   ✅ 2FA Verified and enabled')
  } else {
    console.error('   ❌ 2FA Verify failed', res)
  }

  // 6. Login again with 2FA
  console.log('6. Logging in again with 2FA...')
  res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: TEST_USER.email,
      password: TEST_USER.password,
      twoFACode: speakeasy.totp({ secret: twoFaSecret, encoding: 'base32' }),
    }),
  })
  if (res.status === 200) {
    console.log('   ✅ Logic with 2FA code successful')
  } else {
    console.error('   ❌ Login with 2FA code failed', res)
  }

  // 7. Rate Limiting Test (Account Lockout)
  console.log('7. Testing account lockout...')
  for (let i = 0; i < 6; i++) {
    res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: TEST_USER.email, password: 'wrongpassword' }),
    })
  }
  if (res.status === 429) {
    console.log('   ✅ Account correctly locked out with 429 status')
  } else {
    console.error('   ❌ Account not locked! Expected 429, got', res.status)
  }

  console.log('--- All Tests Completed ---')
}

runTests().catch(console.error)
