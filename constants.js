module.exports = {
    WATCH_ROOM_TABLE: 'WatchRoom',
    WATCH_ROOM_USER_TABLE: 'WatchRoomUser',
    WATCH_ROOM_KEYS: {
        ROOM_CODE: 'room_code',
        VIDEO_ID: 'video_id',
        EMPTY_SINCE: 'empty_since'
    },
    WATCH_ROOM_USER_KEYS: {
        SOCKET_ID: 'socket_id', 
        ROOM_CODE: 'room_code',
    },
    CHARACTERS: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
};

// CREATE TABLE WatchRoom (
//     id SERIAL PRIMARY KEY,
//     room_code VARCHAR(10) UNIQUE NOT NULL,
//     video_id VARCHAR(50) DEFAULT '',
//     empty_since TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );

// CREATE TABLE WatchRoomUser (
//     id SERIAL PRIMARY KEY,
//     socket_id VARCHAR(50) NOT NULL,
//     room_code VARCHAR(10) NOT NULL,
//     FOREIGN KEY (room_id) REFERENCES WatchRoom(id)
// );