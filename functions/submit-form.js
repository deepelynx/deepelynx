const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const { sendWelcomeEmail } = require('../emails/sendWelcomeEmail');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Missing request body.' }),
      };
    }

    const { name, email, token, referral_code, website } = JSON.parse(event.body);

    // Honeypot kontrolü
    if (website && website.trim() !== '') {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Bot detected (honeypot triggered).' }),
      };
    }

    if (!name || !email || !token) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Required fields are missing.' }),
      };
    }

    // Email format doğrulama
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid email format.' }),
      };
    }

    // reCAPTCHA doğrulama
    const recaptchaRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.RECAPTCHA_SECRET}&response=${token}`,
    });

    const recaptchaData = await recaptchaRes.json();
    if (!recaptchaData.success || recaptchaData.score < 0.5) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Suspicious activity detected. Please try again.',
        }),
      };
    }

    // Email tekilleştirme
    const { data: existingUser, error: userCheckError } = await supabase
      .from('deepelynx_tickets')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (userCheckError) throw userCheckError;
    if (existingUser) {
      return {
        statusCode: 409,
        body: JSON.stringify({ success: false, message: 'This email is already registered.' }),
      };
    }

    // Kod üretimi
    const ticket_code = cryptoRandomString(8);
    const new_referral_code = cryptoRandomString(8);

    // Kaydı oluştur
    const { data, error } = await supabase
      .from('deepelynx_tickets')
      .insert({
        name,
        email,
        referral_code: new_referral_code,
        referred_by: referral_code || null,
        ticket_code,
      })
      .select()
      .single();

    if (error) throw error;

    const referral_link = `https://deepelynx.com?ref=${new_referral_code}`;

    // HOŞGELDİN MAILİ GÖNDER (Async, hata kontrolü opsiyonel)
    try {
      await sendWelcomeEmail({
        to: email,
        accessGrantCode: ticket_code,
        issuedDate: new Date().toISOString().split('T')[0], // yyyy-mm-dd format
        inviteLink: referral_link,
      });
    } catch (mailError) {
      console.error("Welcome email send error:", mailError);
      // istersen burada mail gönderilemedi uyarısı da dönebilirsin
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        ticket_code: data.ticket_code,
        referral_link,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: error.message || 'Unexpected server error.',
      }),
    };
  }
};

// 8 karakterlik büyük harf + sayı kod üretimi
function cryptoRandomString(length) {
  return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
}
