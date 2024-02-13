let socket;

document.addEventListener('DOMContentLoaded', function () {
    socket = io();

    socket.on('createWatchRoomResponse', (response) => {
        const { success, signature, data } = response;
        console.log(success ? 'SUCCESS' : 'FAIL', signature);

        if (success) {
            window.location.href = `/watchroom?roomCode=${data.roomCode}`;
        }
    });

    document.getElementById('createRoom').addEventListener('click', function () {
        socket.emit('createWatchRoom');
    });
});