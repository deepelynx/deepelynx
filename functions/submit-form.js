// sendWelcomeEmail fonksiyonu CommonJS formatındaysa bu satır çalışır:
const sendWelcomeEmail = require('../emails/sendWelcomeEmail');

// Eğer yukarıdaki çalışmıyorsa bu alternatifi kullan (o zaman üsttekini sil):
// const sendWelcomeEmail = await import('../emails/sendWelcomeEmail.js').then(m => m.default);

const { createClient } = require('@supabase/supabase-js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { v4: uuidv4 } = require('uuid');

// Ortam değişkenleri
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

// Supabase istemcisi
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const data = JSON.parse(event.body);
    const { email, token, honey } = data;

    // Honeypot koruması
    if (honey && honey.trim() !== '') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Bot detected (honeypot).' }),
      };
    }

    // reCAPTCHA doğrulama
    const recaptchaRes = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${RECAPTCHA_SECRET_KEY}&response=${token}`,
    });
    const recaptchaJson = await recaptchaRes.json();

    if (!recaptchaJson.success || recaptchaJson.score < 0.5) {
      console.warn('reCAPTCHA low score:', recaptchaJson.score);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'reCAPTCHA verification failed.' }),
      };
    }

    // Kod ve tarih oluştur
    const accessGrantCode = `solo${uuidv4().slice(0, 8)}`;
    const issuedDate = new Date().toISOString().split('T')[0];

    // Veritabanına kayıt
    const { error } = await supabase.from('deepelynx_tickets').insert([
      {
        email,
        access_code: accessGrantCode,
        issued_at: issuedDate,
        ticket_type: 'solo',
      },
    ]);

    if (error) {
      console.error('Supabase error:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to save to database' }),
      };
    }

    // Mail gönderimi
    await sendWelcomeEmail({
      to: email,
      accessGrantCode,
      issuedDate,
      inviteLink: 'https://deepelynx.io/access',
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Success',
        accessGrantCode,
        issuedDate,
      }),
    };
  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', detail: err.message }),
    };
  }
};
