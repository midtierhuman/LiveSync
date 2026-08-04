const os = require('os');

// Mask host system & hardware specifications from user scripts
const VIRTUAL_CPU_CORES = 1;
const VIRTUAL_TOTAL_MEM_BYTES = 512 * 1024 * 1024; // 512 MB
const VIRTUAL_FREE_MEM_BYTES = 256 * 1024 * 1024;  // 256 MB

const virtualCpus = Array.from({ length: VIRTUAL_CPU_CORES }, () => ({
  model: 'LiveSync Virtual Core v1.0',
  speed: 2400,
  times: { user: 100, nice: 0, sys: 100, idle: 1000, irq: 0 }
}));

os.cpus = () => virtualCpus;
os.totalmem = () => VIRTUAL_TOTAL_MEM_BYTES;
os.freemem = () => VIRTUAL_FREE_MEM_BYTES;
os.hostname = () => 'livesync-sandbox';
os.release = () => '1.0.0-sandbox';
os.type = () => 'Linux';
os.userInfo = () => ({
  username: 'sandbox',
  uid: 1000,
  gid: 1000,
  shell: '/bin/false',
  homedir: '/app'
});
