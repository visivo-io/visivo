const { Client } = require('pg');

const pgclient = new Client({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres'
});

pgclient.connect();

const table = 'CREATE TABLE test_table(id SERIAL PRIMARY KEY, x INT, y INT)'
const inserts = 'INSERT INTO test_table(x, y) VALUES(1, 1); INSERT INTO test_table(x, y) VALUES(2, 1); INSERT INTO test_table(x, y) VALUES(3, 2); INSERT INTO test_table(x, y) VALUES(4, 3); INSERT INTO test_table(x, y) VALUES(5, 5); INSERT INTO test_table(x, y) VALUES(6, 8);'


pgclient.query(table, (err, res) => {
    if (err) throw err
});

pgclient.query(inserts, (err, res) => {
    if (err) throw err
});

pgclient.query('SELECT * FROM test_table', (err, res) => {
    if (err) throw err
    console.log(err, res.rows) // Print the data in student table
    pgclient.end()
});
