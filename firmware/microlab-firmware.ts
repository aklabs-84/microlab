// 마이크로랩 - 마이크로비트 만능 프로그램 (v1, v2 공용)
// MakeCode(makecode.microbit.org)에서 JavaScript 모드로 붙여 넣어 사용한다.
// 확장(Bluetooth, radio)은 추가하지 않는다. (v1은 메모리가 작다)

serial.redirectToUSB()
serial.setBaudRate(BaudRate.BaudRate115200)

// 켜졌다는 신호
basic.showIcon(IconNames.Heart)
basic.pause(500)
basic.clearScreen()
serial.writeLine("hello")
// 마이크로비트 버전(v1, v2)도 컴퓨터에 알린다
if (control.hardwareVersion().charAt(0) == "2") {
    serial.writeLine("hw:2")
} else {
    serial.writeLine("hw:1")
}

// 버튼 A, B를 누르면 컴퓨터에 알린다
input.onButtonPressed(Button.A, function () {
    serial.writeLine("A")
})
input.onButtonPressed(Button.B, function () {
    serial.writeLine("B")
})

// 컴퓨터가 보낸 "icon:이름" 명령으로 LED에 그림을 보여 준다
serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let cmd = serial.readUntil(serial.delimiters(Delimiters.NewLine))
    if (cmd.indexOf("icon:") == 0) {
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

// 센서값(가속도 x, y, z)을 1초에 약 50번 컴퓨터로 보낸다
basic.forever(function () {
    serial.writeLine("" + input.acceleration(Dimension.X) + "," + input.acceleration(Dimension.Y) + "," + input.acceleration(Dimension.Z))
    basic.pause(20)
})
