// 마이크로랩 - 블루투스 프로그램 (micro:bit v2 전용)
// MakeCode(makecode.microbit.org)에서 JavaScript 모드로 붙여 넣어 사용한다.
// 확장: Bluetooth 추가 (Radio 확장은 함께 쓸 수 없다)
// 프로젝트 설정(톱니바퀴): "페어링 필요 없음(No Pairing Required)"을 켠다.

let connected = false
let streaming = false // 앱이 "start"를 보낸 뒤부터 센서값을 보낸다 (너무 일찍 보내면 메모리가 터진다)

bluetooth.startUartService()

// 컴퓨터와 블루투스로 연결되면 인사를 보낸다
bluetooth.onBluetoothConnected(function () {
    connected = true
    basic.showIcon(IconNames.Heart)
    basic.pause(500)
    basic.clearScreen()
})
bluetooth.onBluetoothDisconnected(function () {
    connected = false
    streaming = false
    basic.showIcon(IconNames.Sad)
})

// 버튼 A, B를 누르면 컴퓨터에 알린다
input.onButtonPressed(Button.A, function () {
    if (streaming) {
        bluetooth.uartWriteLine("A")
    }
})
input.onButtonPressed(Button.B, function () {
    if (streaming) {
        bluetooth.uartWriteLine("B")
    }
})

// 컴퓨터가 보낸 "icon:이름" 명령으로 LED에 그림을 보여 준다
bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let cmd = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))
    if (cmd == "start") {
        bluetooth.uartWriteLine("hello")
        bluetooth.uartWriteLine("hw:2")
        streaming = true
    } else if (cmd.indexOf("icon:") == 0) {
        let name = cmd.substr(5)
        if (name == "heart") {
            basic.showIcon(IconNames.Heart)
        } else if (name == "happy") {
            basic.showIcon(IconNames.Happy)
        } else if (name == "sad") {
            basic.showIcon(IconNames.Sad)
        } else if (name == "yes") {
            basic.showIcon(IconNames.Yes)
        } else if (name == "no") {
            basic.showIcon(IconNames.No)
        } else if (name == "clear") {
            basic.clearScreen()
        }
    }
})

// 센서값(가속도 x, y, z)을 컴퓨터로 계속 보낸다
basic.forever(function () {
    if (streaming) {
        bluetooth.uartWriteLine("" + input.acceleration(Dimension.X) + "," + input.acceleration(Dimension.Y) + "," + input.acceleration(Dimension.Z))
    }
    basic.pause(50) // 1초에 약 20번. 블루투스는 USB보다 느려서 이 정도가 안전하다
})
