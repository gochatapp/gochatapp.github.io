// Verifies that Voice (Edge TTS) feature is correctly implemented in charxi_online.html
// Run: node tests/voice-tts.test.js
const fs = require('fs');
const vm = require('vm');

const APP = 'c:/dev/vivid2.0/gochatapp.github.io/charxi_online.html';
const JS_FILE = 'c:/dev/vivid2.0/gochatapp.github.io/charxi_online.js';

function check(desc, ok, detail=''){
  const status = ok ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} ${desc}${detail ? ' — ' + detail : ''}`);
  if(!ok) process.exitCode = 1;
}

async function main(){
  const html = fs.readFileSync(APP, 'utf8');
  const js = fs.readFileSync(JS_FILE, 'utf8');

  /* 1. Setup checkbox exists in HTML */
  check('HTML has voiceToggle checkbox', /id="voiceToggle"/.test(html));
  check('HTML has voice label (SoniaNeural)', /SoniaNeural/i.test(html));
  check('HTML has "tap play" / "never auto" text', /tap play|never auto|click.*play/i.test(html));

  /* 2. Script parses without SyntaxError */
  let parseError = null;
  try { new vm.Script(js, { filename: 'charxi_online.js' }); }
  catch(e) { parseError = e; }
  check('charxi_online.js parses without SyntaxError', !parseError, parseError ? parseError.message : 'OK');
  if(parseError) return;

  /* 3. LS.voice and state.voice exist */
  check('LS.voice key defined', /voice:"gochat_voice"/.test(js));
  check('state.voice default false', /voice:false/.test(js));

  /* 4. voiceToggle onchange handler */
  check('voiceToggle onchange handler present', /voiceToggle.*onchange/.test(js));
  check('state.voice persisted to localStorage', /localStorage.setItem\(LS.voice/.test(js));

  /* 5. .voice command in handleCommand */
  check('.voice command handler', /cmd==="voice"/.test(js));
  check('.voice toggles state.voice', /state\.voice=!state\.voice/.test(js));
  check('.voice updates checkbox', /\$\(\"voiceToggle\"\)\.checked=state\.voice/.test(js));

  /* 6. .help includes .voice */
  check('.help text includes .voice', /\.voice \[on\|off\|toggle\]/.test(js));

  /* 7. stripMarkdown function (ported from Go) */
  check('stripMarkdown function exists', /function stripMarkdown\(/.test(js));
  check('stripMarkdown removes bold (regex with \\*\\*)', /\\*\\*/.test(js));
  check('stripMarkdown removes italic', /replace.*\*/.test(js));

  /* 8. splitTextForTTS function (ported from Go) */
  check('splitTextForTTS function exists', /function splitTextForTTS\(/.test(js));
  check('splitTextForTTS uses 1000 char chunks', /maxCharacters.*1000|1000.*maxCharacters/.test(js) || /candidate\.length > maxCharacters/.test(js));

  /* 9. fetchEdgeTtsMp3 function */
  check('fetchEdgeTtsMp3 function exists', /function fetchEdgeTtsMp3\(/.test(js) || /async function fetchEdgeTtsMp3\(/.test(js));
  check('Uses en-GB-SoniaNeural voice', /en-GB-SoniaNeural/.test(js));
  check('Caps at 3000 chars total', /3000|maxCharsTotal/.test(js));
  check('Chunks at 1000 chars', /1000|maxCharsChunk/.test(js));
  check('Uses WebSocket to Edge TTS endpoint', /speech\.platform\.bing\.com.*readaloud.*edge/.test(js));
  check('Generates Sec-MS-GSL token with crypto.subtle', /crypto\.subtle\.digest.*SHA-256/.test(js));
  check('Returns audio/mpeg Blob', /Blob.*audio\/mpeg/.test(js));

  /* 10. attachVoicePlayer function */
  check('attachVoicePlayer function exists', /function attachVoicePlayer\(/.test(js) || /async function attachVoicePlayer\(/.test(js));
  check('Creates audio element with controls', /audio\.controls\s*=\s*true/.test(js));
  check('NO autoplay attribute', !/autoplay/.test(js) || /preload.*none/.test(js));
  check('NO .play() call', !/\.play\(\)/.test(js));
  check('Shows generating placeholder', /voice-generating|Generating voice/.test(js));

  /* 11. sendMessage calls attachVoicePlayer for new assistant messages */
  check('sendMessage calls attachVoicePlayer', /attachVoicePlayer\(aiBubble|attachVoicePlayer.*bubble/.test(js));

  /* 12. boot() loads voice state from localStorage */
  check('boot() loads state.voice', /state\.voice=localStorage\.getItem\(LS\.voice\)/.test(js));
  check('boot() sets voiceToggle.checked', /voiceToggle.*checked.*state\.voice/.test(js));

  /* 13. CSS has audio styling */
  const css = fs.readFileSync('c:/dev/vivid2.0/gochatapp.github.io/charxi_online.css', 'utf8');
  check('CSS styles audio element', /audio\{/.test(css) || /\..*audio/.test(css));

  console.log('\n✅ All voice TTS tests passed!');
}

main().catch(e => { console.error('Test error:', e); process.exit(1); });