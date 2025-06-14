const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

// .env dosyasından değişkenleri çek
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY;
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;

// Basit email doğrulama
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

exports.handler = async function (event, context) {
  console.log("✅ Netlify Function submit-form çalıştı");

  // Yalnızca POST istekleri kabul edilir
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: 'Method Not Allowed' }),
    };
  }

  // Env kontrolü
  if (!SUPABASE_URL || !SUPABASE_API_KEY || !RECAPTCHA_SECRET) {
    console.error('❌ Missing env vars:', { SUPABASE_URL, SUPABASE_API_KEY, RECAPTCHA_SECRET });
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Server misconfiguration: Missing environment variables' }),
    };
  }

  // İstek body’sini parse et
  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    console.error('❌ JSON parse hatası:', err);
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Invalid JSON' }),
    };
  }

  const { name, email, referral_code, token } = data;

  if (!name || !email || !token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Missing required fields' }),
    };
  }

  if (!validateEmail(email)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Invalid email format' }),
    };
  }

  // 🛡️ reCAPTCHA doğrulaması
  try {
    const recaptchaResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${RECAPTCHA_SECRET}&response=${token}`,
    });
    const recaptchaData = await recaptchaResponse.json();
    if (!recaptchaData.success || recaptchaData.score < 0.5) {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, message: 'reCAPTCHA verification failed' }),
      };
    }
  } catch (err) {
    console.error('❌ reCAPTCHA doğrulama hatası:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Error verifying reCAPTCHA' }),
    };
  }

  // 📬 Kullanıcı zaten var mı kontrol et
  let existingUsers = [];
  try {
    const check = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
      headers: {
        'apikey': SUPABASE_API_KEY,
        'Authorization': `Bearer ${SUPABASE_API_KEY}`,
        'Accept': 'application/json',
      },
    });
    if (!check.ok) {
      const errorText = await check.text();
      throw new Error(`Supabase check error: ${errorText}`);
    }
    existingUsers = await check.json();
  } catch (err) {
    console.error('❌ Kullanıcı kontrol hatası:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Error checking existing user' }),
    };
  }

  if (existingUsers.length > 0) {
    return {
      statusCode: 409,
      body: JSON.stringify({ success: false, message: 'Email already registered' }),
    };
  }

  // 🎫 Yeni kullanıcı oluştur
  const ticket_code = uuidv4().split('-')[0].toUpperCase();
  const referral_link = `https://deepelynx.com/?ref=${ticket_code}`;

  try {
    const insert = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_API_KEY,
        'Authorization': `Bearer ${SUPABASE_API_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        name,
        email,
        referral_code: referral_code || null,
        ticket_code,
        referral_link,
        created_at: new Date().toISOString(),
      }),
    });

    if (!insert.ok) {
      const errorText = await insert.text();
      throw new Error(`Insert error: ${errorText}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'User registered successfully',
        ticket_code,
        referral_link,
      }),
    };
  } catch (err) {
    console.error('❌ Kullanıcı ekleme hatası:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Error inserting user' }),
    };
  }
};
