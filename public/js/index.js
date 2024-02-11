let socket;

$(document).ready(function () {
    socket = io();

    socket.on('createWatchRoomResponse', (response) => {
        const { success, signature, data } = response;
        console.log(success ? 'SUCCESS' : 'FAIL', signature);

        if (success) {
            window.location.href = `/watchroom?code=${data.code}`;
        }
    });

    $('#createRoom').on('click', function () {
        socket.emit('createWatchRoom');
    });
});