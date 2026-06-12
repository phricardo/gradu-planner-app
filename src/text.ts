const BAD_MARKERS = ['Ã', 'Â', '�', '‡', '‰', '', ''];

function markerScore(value: string) {
  return BAD_MARKERS.reduce((score, marker) => score + value.split(marker).length - 1, 0);
}

function decodeOnce(value: string) {
  const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
  return new TextDecoder('utf-8').decode(bytes);
}

export function displayText(value: string | null | undefined) {
  if (!value) return '';

  let best = value;
  for (let i = 0; i < 2; i += 1) {
    const decoded = decodeOnce(best);
    if (markerScore(decoded) < markerScore(best)) {
      best = decoded;
    }
  }

  return best
    .replaceAll('InformaÃ§Ã£o', 'Informação')
    .replaceAll('ProgramaÃ§Ã£o', 'Programação')
    .replaceAll('MatemÃ¡tica', 'Matemática')
    .replaceAll('AdministraÃ§Ã£o', 'Administração')
    .replaceAll('InteraÃ§Ã£o', 'Interação')
    .replaceAll('GestÃ£o', 'Gestão')
    .replaceAll('Ã‰tica', 'Ética')
    .replaceAll('Ãlgebra', 'Álgebra')
    .replaceAll('ItaguaÃ­', 'Itaguaí')
    .replaceAll('MaracanÃ£', 'Maracanã')
    .replaceAll('Maria da GraÃ§a', 'Maria da Graça')
    .replaceAll('ValenÃ§a', 'Valença');
}
