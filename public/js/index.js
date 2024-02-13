let socket;

document.addEventListener('DOMContentLoaded', function () {
    socket = io();

    socket.on('createWatchRoomResponse', (response) => {
        const { success, signal, data } = response;
        console.log(success ? 'SUCCESS' : 'FAIL', signal);

        if (success) {
            window.location.href = `/watchroom?roomCode=${data.roomCode}`;
        }
    });

    document.getElementById('createRoom').addEventListener('click', function () {
        socket.emit('createWatchRoom');
    });
});