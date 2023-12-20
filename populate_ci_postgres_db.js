const { Client } = require('pg');

const pgclient = new Client({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres'
});

pgclient.connect();

const table = 'CREATE TABLE IF NOT EXISTS test_table(id SERIAL PRIMARY KEY, x INT, y INT)';
const text = 'INSERT INTO test_table(x, y) VALUES($1, $2) RETURNING *';

const records = [
    [1, 1], [2, 1], [3, 2], [4, 3], [5, 5], [6, 8]
];

records.forEach(record => {
    pgclient.query(text, record, (err, res) => {
        if (err) throw err;
        console.log('Inserted:', res.rows[0]);
    });
});


pgclient.end();
