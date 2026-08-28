function createRequest(method, options = {}) {
  return {
    method,
    query: options.query || {},
    body: options.body,
    headers: options.headers || {}
  };
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value) { this.body = value; },
    json() { return this.body ? JSON.parse(this.body) : undefined; }
  };
}

module.exports = { createRequest, createResponse };