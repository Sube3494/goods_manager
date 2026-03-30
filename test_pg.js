const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:2002-ssq.@127.0.0.1:5432/goods_manager'
});
client.connect().then(() => {
  return client.query('SELECT * FROM "User"');
}).then(res => {
  console.log(JSON.stringify(res.rows, null, 2));
  client.end();
}).catch(e => {
  console.error(e);
  client.end();
});
