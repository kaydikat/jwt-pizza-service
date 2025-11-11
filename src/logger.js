const config = require('./config').logging;

class Logger {
    httpLogger = (req, res, next) => {
    const originalSend = res.send;
    res.send = (resBody) => {
      const logData = {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        auth: !!req.headers.authorization,
        req: this.sanitize(JSON.stringify(req.body || {})),
        res: this.sanitize(JSON.stringify(resBody || {})),
        ip: req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown',
        host: req.get('host') || req.hostname || 'unknown',
      };

      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, 'http', logData);

      res.send = originalSend;
      return originalSend.call(res, resBody);
    };
    next();
  };

  log(level, type, logData) {
    let payload = typeof logData === 'string' ? logData : JSON.stringify(logData);
    payload = this.sanitize(payload);

    const labels = { component: config.source, level, type };
    const values = [[this.nowString(), payload]];
    const event = { streams: [{ stream: labels, values }] };

    this.sendLogToGrafana(event);
  }
  dbQuery(sql, params = []) {
    this.log('info', 'db', { sql, params });
  }

  factoryReq(body) {
    this.log('info', 'factory', { req: this.sanitize(JSON.stringify(body)) });
  }

  factoryRes(status, body, latency) {
    this.log('info', 'factory', {
      res: this.sanitize(JSON.stringify(body)),
      status,
      latency,
    });
  }

  // ──────────────────────────────────────────────────────────────
  // UTILITIES
  // ──────────────────────────────────────────────────────────────
  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    return (Date.now() * 1_000_000).toString();
  }

  sanitize(data) {
    let str = typeof data === 'string' ? data : JSON.stringify(data);
    return str
      .replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"*****"')
      .replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"*****"')
      .replace(/"jwt"\s*:\s*"[^"]*"/gi, '"jwt":"*****"')
      .replace(/"apiKey"\s*:\s*"[^"]*"/gi, '"apiKey":"*****"')
      .replace(/"authorization"\s*:\s*"[^"]*"/gi, '"authorization":"*****"')
      .replace(/"Bearer\s+[a-zA-Z0-9\-_.+/=]*"/gi, '"Bearer *****"')
      .replace(/"email"\s*:\s*"[^"@]+@[^"]+"/gi, '"email":"*****@*****"')
      .replace(/"id"\s*:\s*\d+/gi, '"id":<redacted>')
      .replace(/"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"/gi, '"<uuid>"');
  }

  sendLogToGrafana(event) {
    const body = JSON.stringify(event);
    fetch(config.url, {
      method: 'post',
      body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.userId}:${config.apiKey}`,
      },
    })
      .then(res => {
        if (!res.ok) console.error('Failed to send log to Grafana:', res.status, res.statusText);
      })
      .catch(err => console.error('Network error sending log:', err.message));
  }
}

module.exports = new Logger();