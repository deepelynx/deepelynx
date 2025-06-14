const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function(event, context) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const data = JSON.parse(event.body);

    // reCAPTCHA doğrulaması
    const recaptchaResponse = data.recaptchaToken;
    if (!recaptchaResponse) {
      return { statusCode: 400, body: JSON.stringify({ error: 'reCAPTCHA token is missing.' }) };
    }

    const recaptchaVerify = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET}&response=${recaptchaResponse}`,
      { method: 'POST' }
    );
    const recaptchaResult = await recaptchaVerify.json();
    if (!recaptchaResult.success || recaptchaResult.score < 0.5) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Failed reCAPTCHA verification.' }) };
    }

    // Form verilerini ayıkla
    const { user_id, product_name, quantity = 1, referral_code_used = null } = data;

    if (!user_id || !product_name) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields.' }) };
    }

    // Fiyat ve bonus tablosu (USD)
    const prices = {
      'Quantum Solo': 5,
      'Quantum Sync': 20,
      'Quantum Surge': 35,
      'Quantum Legend': 70,
    };

    const bonuses = {
      'Quantum Sync': 5,
      'Quantum Surge': 10,
      'Quantum Legend': 20,
    };

    const price_usd = prices[product_name];
    if (!price_usd) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid product name.' }) };
    }

    // Satın alma işlemini kaydet
    const { error: insertError } = await supabase
      .from('deepelynx_tickets')
      .insert([{
        user_id,
        product_name,
        purchase_date: new Date().toISOString(),
        quantity,
        price_usd,
        referral_code_used,
        referral_bonus_granted: !!referral_code_used,
      }]);

    if (insertError) {
      return { statusCode: 500, body: JSON.stringify({ error: insertError.message }) };
    }

    // Eğer referral kullanıldıysa bonus bilet ver
    if (referral_code_used && bonuses[product_name]) {
      const bonus_per_unit = bonuses[product_name];
      const total_bonus = bonus_per_unit * quantity;

      // Referans sahibi kişiyi bul
      const { data: refOwner, error: refFetchError } = await supabase
        .from('refferal_tracking')
        .select('user_id, ticket_count')
        .eq('referral_code', referral_code_used)
        .maybeSingle();

      if (refFetchError) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch referral owner.' }) };
      }

      if (refOwner) {
        const updatedTicketCount = (refOwner.ticket_count || 0) + total_bonus;

        const { error: updateError } = await supabase
          .from('refferal_tracking')
          .update({ ticket_count: updatedTicketCount })
          .eq('user_id', refOwner.user_id);

        if (updateError) {
          return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update referral bonus.' }) };
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Ticket purchased successfully.' }),
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
