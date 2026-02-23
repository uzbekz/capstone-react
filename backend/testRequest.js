import http from 'http';

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/reports/overview',
  method: 'GET',
  headers: {
    Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NCwicm9sZSI6InByb2R1Y3RfbWFuYWdlciIsImlhdCI6MTc3MTg0MDMxMSwiZXhwIjoxNzcxODQzOTExfQ.PFU1x9ppjbeaGmbm769N42KF3FeDSuXn1sILJIWrLKU'
  }
};

const req = http.request(options, res => {
  console.log('status', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('body', data));
});
req.on('error', console.error);
req.end();
