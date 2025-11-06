const os = require('os');
const metrics = require('./metrics');

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

const metrics = require('./metrics');

orderRouter.post('/', (req, res) => {
    if (purchase pizza from factory) {
      metrics.pizzaPurchase(success, latency, price);
    } else {
      metrics.pizzaPurchase(failure, latency, 0);
    }
  }
);

function sendMetricsPeriodically(period) {
  const timer = setInterval(() => {
    try {
      const metrics = new OtelMetricBuilder();
      metrics.add(httpMetrics);
      metrics.add(systemMetrics);
      metrics.add(userMetrics);
      metrics.add(purchaseMetrics);
      metrics.add(authMetrics);

      metrics.sendToGrafana();
    } catch (error) {
      console.log('Error sending metrics', error);
    }
  }, period);
}