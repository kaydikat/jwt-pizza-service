const config = require('./config').logging;

class Logger {
    httpLogger = (req, res, next) => {
    const originalSend = res.send;
    res.send = (resBody) => {
        const logData = {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        authorized: !!req.headers.authorization,
        reqBody: this.sanitize(JSON.stringify(req.body || {})),
        resBody: this.sanitize(JSON.stringify(resBody || {})),

        clientIp: req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown',
        host: req.get('host') || req.hostname || 'unknown',
        };

        const level = this.statusToLogLevel(res.statusCode);
        this.log(level, 'http-req', logData);

        res.send = originalSend;
        return originalSend.call(res, resBody);
    };
    next();
    };

  log(level, type, logData) {
    const labels = { component: config.source, level: level, type: type };
    const values = [this.nowString(), this.sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };

    this.sendLogToGrafana(logEvent);
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    return (Math.floor(Date.now()) * 1000000).toString();
  }

sanitize(data) {
    let str = data;
    if (typeof str !== 'string') {
      str = JSON.stringify(str);
    }

    return str
      .replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"*****"')
      .replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"*****"')
      .replace(/"jwt"\s*:\s*"[^"]*"/gi, '"jwt":"*****"')
      .replace(/"apiKey"\s*:\s*"[^"]*"/gi, '"apiKey":"*****"')
      .replace(/"authorization"\s*:\s*"[^"]*"/gi, '"authorization":"*****"')
      .replace(/"Bearer\s+[a-zA-Z0-9\-_.+/=]*"/gi, '"Bearer *****"')
      .replace(/"email"\s*:\s*"[^"@]+@[^"]+"/gi, '"email":"*****@*****"')
      .replace(/"id"\s*:\s*\d+/gi, '"id":<redacted>') // optional: hide user IDs
      .replace(/"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"/gi, '"<uuid>"');
  }

  sendLogToGrafana(event) {
    const body = JSON.stringify(event);
    fetch(`${config.url}`, {
      method: 'post',
      body: body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.userId}:${config.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.log('Failed to send log to Grafana');
    });
  }
}
module.exports = new Logger();