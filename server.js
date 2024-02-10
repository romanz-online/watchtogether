const QueryHandler = require('./queryHandler');

const path = require('path');
const express = require('express');
const { Pool } = require('pg');

const app = express();
const httpServer = require('http').createServer(app);
const io = require('socket.io')(httpServer);
let connectedClients = {};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/socket.io', express.static(__dirname + '/node_modules/socket.io/client-dist'));

const dbConfig = process.env.DATABASE_URL ? {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000
} : {
    user: 'postgres',
    host: 'localhost',
    database: 'watch',
    password: 'admin',
    port: 5432,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000
};
const pool = new Pool(dbConfig);

const queryHandlerInstance = new QueryHandler('watch', pool);

const asURL = (f) => `${__dirname}/public/${f}`;

// app.post('/generateUsername', (req, res) => {
//     const signature = 'generateUsername';
//     debugConsole(CATEGORY.REQUEST, signature);

//     const username = generateUsername();

//     res.send({
//         success: true,
//         signature: signature,
//         data: {
//             username: username
//         }
//     });

//     debugConsole(CATEGORY.SUCCESS, signature);
// });


io.on('connection', (socket) => {
    // associate the socket with the client's unique identifier
    // this clientID is stored in the database to track who's playing in a scrabble game
    connectedClients[socket.id] = socket;

    socket.on('disconnect', () => {
        delete connectedClients[socket.id];
    });

    socket.on('play', (data) => {
        console.log('play');
        const { timestamp } = data;
        socket.broadcast.emit('play', { data: { timestamp: timestamp } });
    });

    socket.on('pause', (data) => {
        console.log('pause');
        const { timestamp } = data;
        socket.broadcast.emit('pause', { data: { timestamp: timestamp } });
    });

    socket.on('rate', (data) => {
        console.log('rate');
        const { rate } = data;
        socket.broadcast.emit('rate', { data: { rate: rate } });
    });

    // socket.on('joinScrabbleRoom', (data) => {
    //     const { roomCode } = data;
    //     joinScrabbleRoom(socket, roomCode, clientID);
    // });
});





// async function createScrabbleRoom(socket, clientID, playerCount) {
//     const signature = arguments.callee.name;
//     debugConsole(CATEGORY.FUNCTION, signature);

//     try {
//         const newRoomCode = await generateRoomCode();

//         let columns = [KEYS.LAST_MODIFIED, KEYS.ROOM_CODE, KEYS.IP1, KEYS.PLAYER_COUNT, KEYS.WHOSE_TURN];
//         let values = ['NOW()', newRoomCode, clientID, playerCount, 1];

//         // generate all players' docks as the game starts
//         let remainingLetters = DEFAULT_REMAINING_LETTERS;
//         for (let i = 1; i <= playerCount; i++) {
//             const { newDock, newRemainingLetters } = getDockTiles(remainingLetters, '');

//             const dockKey = `dock${i}`;
//             columns.push(dockKey);
//             values.push(newDock);

//             remainingLetters = newRemainingLetters;
//         }
//         columns.push(KEYS.REMAINING_LETTERS);
//         values.push(remainingLetters);

//         const params = {
//             columns: columns,
//             values: values
//         };
//         await queryHandlerInstance.insert(params);

//         socketEmit(socket, signature, true, {
//             roomCode: newRoomCode
//         });

//         debugConsole(CATEGORY.SUCCESS, signature);
//     } catch (err) {
//         console.error(err);
//         socketEmit(socket, signature, false, {});
//     }
// }








// HELPER METHODS

function socketEmit(socket, signature, success, data) {
    socket.emit(`${signature}Response`, {
        success: success,
        signature: signature,
        data: data
    });
}

async function generateRoomCode() {
    const signature = arguments.callee.name;
    console.log(signature);

    try {
        while (true) {
            let roomCode = '';

            for (let i = 0; i < 5; i++) {
                const randomIndex = Math.floor(Math.random() * characters.length);
                roomCode += characters.charAt(randomIndex);
            }

            const record = getRowFromRoomCode(roomCode);

            if (!record.rows) {
                return roomCode;
            } else {
                console.log(`roomCode ${roomCode} was not unique. Trying again...`);
            }
        }
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function getRowFromRoomCode(roomCode) {
    const signature = arguments.callee.name;
    console.log(signature);

    try {
        const params = { where: [{ key: KEYS.ROOM_CODE, value: roomCode }] };
        const result = await queryHandlerInstance.select(params);

        // query only ever returns one row since roomCode is unique
        return result[0];
    } catch (err) {
        console.error(err);
        throw err;
    }
}

function getKeysFromPlayerNumber(playerNumber) {
    return {
        // ipKey: `ip${playerNumber}`,
        // passKey: `pass${playerNumber}`,
        // pointsKey: `points${playerNumber}`,
        // dockKey: `dock${playerNumber}`
    };
}

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => { console.log(`Server is running at http://localhost:${PORT}`); });
