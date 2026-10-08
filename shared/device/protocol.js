// 마이크로비트가 보내는 한 줄을 읽어서 이벤트로 바꾼다. (USB, 블루투스가 함께 쓴다)
// "x,y,z" 센서값 / "A", "B" 버튼 / "hello" 인사 / "hw:1", "hw:2" 마이크로비트 버전
const DATA_LINE = /^(-?\d+),(-?\d+),(-?\d+)$/;
const HW_LINE = /^hw:([12])$/;

export function handleLine(line, emit) {
  if (!line) return;
  const m = DATA_LINE.exec(line);
  if (m) {
    emit('sample', { t: performance.now(), x: +m[1], y: +m[2], z: +m[3] });
  } else if (line === 'A' || line === 'B') {
    emit('button', { name: line });
  } else if (line === 'hello') {
    emit('hello');
  } else if (HW_LINE.test(line)) {
    emit('info', { hw: Number(HW_LINE.exec(line)[1]) });
  }
  // 그 밖의 줄(깨진 줄)은 무시한다.
}

// 조각조각 들어오는 글자를 모아서 줄 단위로 나눠 주는 도우미
export function lineSplitter(onLine) {
  let buffer = '';
  return (text) => {
    buffer += text;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      onLine(buffer.slice(0, i).trim());
      buffer = buffer.slice(i + 1);
    }
    if (buffer.length > 200) buffer = ''; // 줄바꿈 없는 쓰레기 방지
  };
}
