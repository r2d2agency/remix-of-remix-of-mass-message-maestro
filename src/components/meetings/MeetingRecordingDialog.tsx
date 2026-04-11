import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Meeting } from "@/hooks/use-meetings";
import {
  Mic, MicOff, Monitor, Pause, Play, Square, CheckCircle2,
  AlertCircle, Volume2, ExternalLink, Loader2
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: Meeting;
  onRecordingComplete: (audioBlob: Blob, durationSeconds: number) => void;
}

type RecordingPhase = "setup" | "ready" | "recording" | "paused" | "done";

export function MeetingRecordingDialog({ open, onOpenChange, meeting, onRecordingComplete }: Props) {
  const [phase, setPhase] = useState<RecordingPhase>("setup");
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [screenShared, setScreenShared] = useState(false);
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      cleanup();
      setPhase("setup");
      setMicOk(null);
      setScreenShared(false);
      setDuration(0);
      setError("");
      setMicLevel(0);
    }
  }, [open]);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    testStreamRef.current?.getTracks().forEach(t => t.stop());
    audioContextRef.current?.close().catch(() => {});
    screenStreamRef.current = null;
    micStreamRef.current = null;
    testStreamRef.current = null;
    combinedStreamRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  // Test microphone
  const testMic = useCallback(async () => {
    setMicTesting(true);
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      testStreamRef.current = stream;

      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let maxLevel = 0;
      let frames = 0;

      const check = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
        setMicLevel(avg);
        if (avg > maxLevel) maxLevel = avg;
        frames++;

        if (frames < 60) {
          animFrameRef.current = requestAnimationFrame(check);
        } else {
          // Done testing
          stream.getTracks().forEach(t => t.stop());
          ctx.close();
          testStreamRef.current = null;
          setMicOk(maxLevel > 0.01);
          setMicTesting(false);
          setMicLevel(0);
        }
      };
      animFrameRef.current = requestAnimationFrame(check);
    } catch {
      setMicOk(false);
      setMicTesting(false);
      setError("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  }, []);

  // Share screen + capture audio
  const shareScreen = useCallback(async () => {
    setError("");
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true, // captures tab/system audio
      });
      screenStreamRef.current = screen;
      setScreenShared(true);

      // Listen for user stopping share
      screen.getVideoTracks()[0].onended = () => {
        setScreenShared(false);
        screenStreamRef.current = null;
      };

      // If mic is ok, we're ready
      if (micOk) setPhase("ready");
    } catch {
      setError("Compartilhamento de tela cancelado ou não suportado.");
    }
  }, [micOk]);

  // Check if ready
  useEffect(() => {
    if (micOk && screenShared && phase === "setup") {
      setPhase("ready");
    }
  }, [micOk, screenShared, phase]);

  // Start recording
  const startRecording = useCallback(async () => {
    setError("");
    try {
      // Get fresh mic stream
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      micStreamRef.current = mic;

      // Combine screen audio + mic into one stream
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();

      // Add mic
      const micSource = ctx.createMediaStreamSource(mic);
      micSource.connect(dest);

      // Add screen audio if available
      const screenAudioTracks = screenStreamRef.current?.getAudioTracks();
      if (screenAudioTracks && screenAudioTracks.length > 0) {
        const screenAudioStream = new MediaStream(screenAudioTracks);
        const screenSource = ctx.createMediaStreamSource(screenAudioStream);
        screenSource.connect(dest);
      }

      combinedStreamRef.current = dest.stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(dest.stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onRecordingComplete(blob, durationRef.current);
        setPhase("done");
      };

      recorder.start(500);
      setPhase("recording");
      setDuration(0);
      durationRef.current = 0;

      timerRef.current = setInterval(() => {
        setDuration(prev => {
          const next = prev + 1;
          durationRef.current = next;
          return next;
        });
      }, 1000);

      // Set up analyser for level meter during recording
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      micSource.connect(analyser);
      analyserRef.current = analyser;

      const updateLevel = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        setMicLevel(avg);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      animFrameRef.current = requestAnimationFrame(updateLevel);

    } catch {
      setError("Erro ao iniciar gravação.");
    }
  }, [onRecordingComplete]);

  // Pause/Resume
  const togglePause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase("paused");
    } else if (recorder.state === "paused") {
      recorder.resume();
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
      setPhase("recording");
    }
  }, []);

  // Stop
  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    mediaRecorderRef.current?.stop();
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    // Don't stop screen share - let user control that
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={open ? onOpenChange : undefined}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            Captura de Reunião
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1 truncate">{meeting.title}</p>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Setup Phase */}
        {(phase === "setup" || phase === "ready") && (
          <div className="space-y-4">
            {/* Meeting Link */}
            {meeting.meeting_link && (
              <Card className="p-3 flex items-center justify-between gap-2">
                <div className="text-sm">
                  <p className="font-medium">Link da reunião</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[280px]">{meeting.meeting_link}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.open(meeting.meeting_link, '_blank')}>
                  <ExternalLink className="h-4 w-4 mr-1" /> Abrir
                </Button>
              </Card>
            )}

            {/* Step 1: Mic Test */}
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {micOk === null ? (
                    <Mic className="h-5 w-5 text-muted-foreground" />
                  ) : micOk ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <MicOff className="h-5 w-5 text-destructive" />
                  )}
                  <div>
                    <p className="text-sm font-medium">1. Testar Microfone</p>
                    <p className="text-xs text-muted-foreground">
                      {micOk === null ? "Clique para verificar" : micOk ? "Microfone funcionando!" : "Microfone não detectado"}
                    </p>
                  </div>
                </div>
                <Button variant={micOk ? "outline" : "default"} size="sm" onClick={testMic} disabled={micTesting}>
                  {micTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : micOk ? "Retestar" : "Testar"}
                </Button>
              </div>
              {micTesting && (
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-primary" />
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-100"
                      style={{ width: `${Math.min(micLevel * 300, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">Fale algo...</span>
                </div>
              )}
            </Card>

            {/* Step 2: Screen Share */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {screenShared ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <Monitor className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">2. Compartilhar Tela</p>
                    <p className="text-xs text-muted-foreground">
                      {screenShared
                        ? "Tela compartilhada! O áudio da aba será capturado."
                        : "Compartilhe a aba do navegador com a reunião"}
                    </p>
                  </div>
                </div>
                <Button
                  variant={screenShared ? "outline" : "default"}
                  size="sm"
                  onClick={shareScreen}
                  disabled={screenShared}
                >
                  {screenShared ? "Ativo" : "Compartilhar"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 ml-7">
                💡 Dica: Marque "Compartilhar áudio da aba" para capturar o som da reunião
              </p>
            </Card>

            {/* Start button */}
            <Button
              className="w-full gap-2"
              size="lg"
              disabled={!micOk || !screenShared}
              onClick={startRecording}
            >
              <Play className="h-5 w-5" />
              Iniciar Gravação
            </Button>

            {(!micOk || !screenShared) && (
              <p className="text-xs text-center text-muted-foreground">
                Complete os passos acima para iniciar a gravação
              </p>
            )}
          </div>
        )}

        {/* Recording / Paused Phase */}
        {(phase === "recording" || phase === "paused") && (
          <div className="space-y-6 py-4">
            {/* Timer */}
            <div className="text-center">
              <div className="inline-flex items-center gap-3 bg-muted/50 rounded-2xl px-6 py-4">
                <div className={`h-3 w-3 rounded-full ${phase === "recording" ? "bg-red-500 animate-pulse" : "bg-yellow-500"}`} />
                <span className="text-4xl font-mono font-bold tracking-wider">{formatTime(duration)}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {phase === "recording" ? "Gravando..." : "Pausado"}
              </p>
            </div>

            {/* Live mic level */}
            {phase === "recording" && (
              <div className="flex items-center gap-2 px-4">
                <Mic className="h-4 w-4 text-red-500" />
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full transition-all duration-75"
                    style={{ width: `${Math.min(micLevel * 300, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="lg"
                className="gap-2 min-w-[140px]"
                onClick={togglePause}
              >
                {phase === "recording" ? (
                  <><Pause className="h-5 w-5" /> Pausar</>
                ) : (
                  <><Play className="h-5 w-5" /> Continuar</>
                )}
              </Button>
              <Button
                variant="destructive"
                size="lg"
                className="gap-2 min-w-[140px]"
                onClick={stopRecording}
              >
                <Square className="h-5 w-5" /> Finalizar
              </Button>
            </div>
          </div>
        )}

        {/* Done Phase */}
        {phase === "done" && (
          <div className="text-center py-6 space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <div>
              <p className="font-medium">Gravação concluída!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Duração: {formatTime(duration)} — O áudio será processado para transcrição.
              </p>
            </div>
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
