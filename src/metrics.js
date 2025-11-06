const os = require("os");
const config = require("./config");

const requests = {};

function requestTracker(req, res, next) {
  const endpoint = `[${req.method}] ${req.path}`;
  requests[endpoint] = (requests[endpoint] || 0) + 1;
  next();
}

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

let pizzaAttempts = 0;
let pizzaSuccesses = 0;
let pizzaFailures = 0;
let pizzaRevenue = 0;
let pizzaLatencyTotal = 0;

function pizzaPurchase(success, latency, price, numPizzas) {
  pizzaAttempts += numPizzas;
  pizzaLatencyTotal += latency;
  if (success) {
    pizzaSuccesses += numPizzas;
    pizzaRevenue += price;
  } else {
    pizzaFailures += numPizzas;
  }
}

let authSuccesses = 0;
let authFailures = 0;

function authAttempt(success) {
  if (success) {
    authSuccesses++;
  } else {
    authFailures++;
  }
}

let activeUsers = 0;

function userLoggedIn() {
  activeUsers++;
}

function userLoggedOut() {
  if (activeUsers > 0) {
    activeUsers--;
  }
}

function sendMetricsPeriodically(period = 10000) {
  setInterval(() => {
    const metrics = [];

    // Add system metrics (gauges, calculated fresh each time)
    metrics.push(
      createMetric(
        "cpu_usage",
        getCpuUsagePercentage(),
        "%",
        "gauge",
        "asDouble",
        {}
      )
    );
    metrics.push(
      createMetric(
        "memory_usage",
        getMemoryUsagePercentage(),
        "%",
        "gauge",
        "asDouble",
        {}
      )
    );

    // Add purchase metrics (sums)
    metrics.push(createMetric("pizza_attempts", pizzaAttempts, "1", "sum", "asInt", {}));
    metrics.push(createMetric("pizza_successes", pizzaSuccesses, "1", "sum", "asInt", {}));
    metrics.push(createMetric("pizza_failures", pizzaFailures, "1", "sum", "asInt", {}));
    metrics.push(createMetric("pizza_revenue", pizzaRevenue, "1", "sum", "asDouble", {}));
    metrics.push(createMetric('auth_successes', authSuccesses, '1', 'sum', 'asInt', {}));
    metrics.push(createMetric('auth_failures', authFailures, '1', 'sum', 'asInt', {}));
    metrics.push(createMetric('active_users', activeUsers, '1', 'gauge', 'asInt', {}));
    metrics.push(
      createMetric(
        "pizza_latency_ms",
        pizzaLatencyTotal,
        "ms",
        "sum",
        "asInt",
        {}
      )
    );

    // TODO: Add HTTP, user, and auth metrics here
    // e.g., Object.keys(requests).forEach((key) => {
    //   metrics.push(createMetric('requests', requests[key], '1', 'sum', 'asInt', { method: key }));
    // });
    // metrics.push(createMetric('auth_successes', authSuccesses, '1', 'sum', 'asInt', {}));
    // etc.

    sendMetricToGrafana(metrics);
  }, period);
}

function createMetric(
  metricName,
  metricValue,
  metricUnit,
  metricType,
  valueType,
  attributes
) {
  attributes = { ...attributes, source: config.source };

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
          attributes: [],
        },
      ],
    },
  };

  Object.keys(attributes).forEach((key) => {
    metric[metricType].dataPoints[0].attributes.push({
      key: key,
      value: { stringValue: attributes[key] },
    });
  });

  if (metricType === "sum") {
    metric[metricType].aggregationTemporality =
      "AGGREGATION_TEMPORALITY_CUMULATIVE";
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function sendMetricToGrafana(metrics) {
  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  fetch(`${config.url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }
    })
    .catch((error) => {
      console.error("Error pushing metrics:", error);
    });
}

module.exports = { requestTracker, pizzaPurchase, authAttempt, userLoggedIn, userLoggedOut, sendMetricsPeriodically };
