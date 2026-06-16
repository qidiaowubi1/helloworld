export default function handler(_request, response) {
  response.status(202).json({
    status: "noop",
    provider: "vercel-live-fallback",
    message: "Production data is refreshed on each /api/dashboard request. Local SQLite scheduler remains available in desktop dev."
  });
}
