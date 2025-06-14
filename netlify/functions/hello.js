// functions/hello.js
exports.handler = async function(event, context) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message: "Hello from Netlify Function!" })
  };
};
