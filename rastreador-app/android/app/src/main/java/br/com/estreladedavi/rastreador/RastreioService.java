package br.com.estreladedavi.rastreador;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Servico em primeiro plano: pega o GPS no horario de trabalho e envia ao CRM, sem precisar do app aberto. */
public class RastreioService extends Service {
    static final String CANAL = "rastreio";
    static volatile boolean rodando = false;

    private Armazem arm;
    private LocationManager lm;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final ExecutorService rede = Executors.newSingleThreadExecutor();
    private PowerManager.WakeLock wl;
    private boolean ouvindo = false;
    private Location ultimo;
    private long ultimoEnfileirado = 0, ultimaConfig = 0;
    private volatile boolean enviando = false;

    private final LocationListener ouvinte = new LocationListener() {
        @Override public void onLocationChanged(Location l) {
            if (ultimo == null || l.getAccuracy() <= ultimo.getAccuracy() + 150 || l.getTime() - ultimo.getTime() > 60000) ultimo = l;
            long agora = System.currentTimeMillis();
            arm.putL("ultimo_gps", agora);
            // o aviso do GPS acorda o aparelho: ja registra e envia aqui, sem esperar o relogio interno
            if (arm.getB("na_janela", false)) {
                int intervalo = Math.max(15, (int) Long.parseLong(arm.get("intervalo", "60")));
                if (agora - ultimoEnfileirado >= intervalo * 800L) { ultimoEnfileirado = agora; enfileirar(ultimo); }
                dispararEnvio();
            }
        }
        @Override public void onStatusChanged(String p, int s, Bundle e) { }
        @Override public void onProviderEnabled(String p) { }
        @Override public void onProviderDisabled(String p) { }
    };

    private final Runnable ciclo = new Runnable() {
        @Override public void run() {
            try { tick(); } catch (Throwable t) { arm.put("erro", "Falha interna: " + t.getMessage()); }
            h.postDelayed(this, 10_000);
        }
    };

    /** No Android 14+ o servico de localizacao so pode iniciar com a permissao de localizacao ja concedida. */
    static boolean podeIniciar(Context c) {
        return androidx.core.content.ContextCompat.checkSelfPermission(c, android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
            || androidx.core.content.ContextCompat.checkSelfPermission(c, android.Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    @Override public void onCreate() {
        super.onCreate();
        arm = new Armazem(this);
        try {
            lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            criarCanal();
            Notification n = notificacao("Localização enviada somente no horário de trabalho.");
            if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(1, n);
            rodando = true;
            h.post(ciclo);
        } catch (Throwable t) {
            arm.put("erro", "Não foi possível iniciar o serviço: " + t.getClass().getSimpleName() + " " + t.getMessage());
            rodando = false;
            stopSelf();
        }
    }

    @Override public int onStartCommand(Intent i, int f, int id) { return START_STICKY; }
    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onTaskRemoved(Intent rootIntent) {
        // app arrastado da lista de recentes: o servico segue; se o sistema derrubar, o START_STICKY traz de volta
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy() {
        rodando = false;
        h.removeCallbacksAndMessages(null);
        pararGps();
        segurarAparelho(false);
        rede.shutdown();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ ciclo
    private void tick() {
        if (!arm.getB("ativo", false)) { stopSelf(); return; }
        long agora = System.currentTimeMillis();
        long esperaCfg = arm.get("inicio", null) == null ? 15_000L : 5 * 60_000L;   // sem horario ainda: tenta a cada minuto
        if (agora - ultimaConfig > esperaCfg) { ultimaConfig = agora; rede.execute(this::atualizarConfig); }
        boolean dentro = naJanela();
        arm.putB("na_janela", dentro);
        segurarAparelho(dentro);
        if (dentro) {
            iniciarGps();
            int intervalo = Math.max(15, (int) Long.parseLong(arm.get("intervalo", "60")));
            if (ultimo != null && agora - ultimoEnfileirado >= intervalo * 800L && agora - ultimo.getTime() < intervalo * 3000L + 60_000L) {
                ultimoEnfileirado = agora;
                enfileirar(ultimo);
            }
        } else {
            pararGps();
        }
        if (arm.pendentes() > 0) dispararEnvio();
    }

    private void dispararEnvio() {
        if (enviando) return;
        enviando = true;
        rede.execute(() -> { try { enviar(); } finally { enviando = false; } });
    }

    private PowerManager.WakeLock wlJanela;
    /** Dentro do horario de trabalho mantem a CPU acordada para o relogio interno nao parar com a tela apagada. */
    private void segurarAparelho(boolean dentro) {
        try {
            if (dentro) {
                if (wlJanela == null) wlJanela = ((PowerManager) getSystemService(Context.POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "rastreador:janela");
                if (!wlJanela.isHeld()) wlJanela.acquire(15 * 60_000L);
            } else if (wlJanela != null && wlJanela.isHeld()) {
                wlJanela.release();
            }
        } catch (Throwable ignored) { }
    }

    private boolean naJanela() {
        if (!arm.getB("cfg_ativo", false)) return false;
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"));
        int iso = (c.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1;
        if (!("," + arm.get("dias", "1,2,3,4,5") + ",").contains("," + iso + ",")) return false;
        int min = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        return min >= minutos(arm.get("inicio", "08:00")) && min <= minutos(arm.get("fim", "18:00"));
    }

    private static int minutos(String hm) {
        try { String[] p = hm.split(":"); return Integer.parseInt(p[0]) * 60 + Integer.parseInt(p[1]); } catch (Exception e) { return 0; }
    }

    @SuppressWarnings("MissingPermission")
    private void iniciarGps() {
        if (ouvindo) return;
        try {
            int intervalo = Math.max(15, (int) Long.parseLong(arm.get("intervalo", "60")));
            long ms = 10_000L;
            boolean algum = false;
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) { lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, ms, 0, ouvinte, Looper.getMainLooper()); algum = true; }
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) { lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, ms, 0, ouvinte, Looper.getMainLooper()); algum = true; }
            ouvindo = algum;
            if (algum && ultimo == null) {
                Location a = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER), b = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                Location melhor = a == null ? b : (b == null ? a : (b.getTime() > a.getTime() ? b : a));
                if (melhor != null && System.currentTimeMillis() - melhor.getTime() < 10 * 60_000L) ultimo = melhor;   // ja tem posicao para enviar de imediato
            }
            arm.put("erro", algum ? "" : "GPS desligado no celular. Ative a localização.");
        } catch (SecurityException e) {
            arm.put("erro", "Sem permissão de localização. Abra o app e permita \"O tempo todo\".");
        } catch (Throwable t) {
            arm.put("erro", "GPS: " + t.getMessage());
        }
    }

    private void pararGps() {
        if (!ouvindo) return;
        try { lm.removeUpdates(ouvinte); } catch (Throwable ignored) { }
        ouvindo = false;
    }

    private int bateria() {
        try {
            BatteryManager b = (BatteryManager) getSystemService(Context.BATTERY_SERVICE);
            return b.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
        } catch (Throwable t) { return -1; }
    }

    private void enfileirar(Location l) {
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            JSONObject p = new JSONObject();
            p.put("t", f.format(new Date(System.currentTimeMillis())));
            p.put("lat", l.getLatitude());
            p.put("lng", l.getLongitude());
            p.put("prec", Math.round(l.getAccuracy()));
            int b = bateria();
            if (b >= 0) p.put("bat", b);
            arm.empilhar(p);
        } catch (Exception ignored) { }
    }

    // ------------------------------------------------------------------- rede
    private String chamar(String caminho, String corpo, String token) throws Exception {
        String base = arm.get("url", "");
        HttpURLConnection c = (HttpURLConnection) new URL(base + caminho).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(20000);
        c.setRequestMethod("POST"); c.setDoOutput(true);
        c.setRequestProperty("apikey", arm.get("key", ""));
        c.setRequestProperty("Content-Type", "application/json");
        if (token != null) c.setRequestProperty("Authorization", "Bearer " + token);
        OutputStream os = c.getOutputStream(); os.write(corpo.getBytes("UTF-8")); os.close();
        int code = c.getResponseCode();
        java.io.InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
        StringBuilder sb = new StringBuilder();
        if (is != null) { java.io.BufferedReader r = new java.io.BufferedReader(new java.io.InputStreamReader(is, "UTF-8")); String ln; while ((ln = r.readLine()) != null) sb.append(ln); r.close(); }
        c.disconnect();
        if (code == 401 || code == 403) throw new SessaoExpirada(sb.toString());
        if (code >= 400) throw new Exception("HTTP " + code + " " + sb);
        return sb.toString();
    }

    private static class SessaoExpirada extends Exception { SessaoExpirada(String m) { super(m); } }

    private boolean renovar() {
        try {
            String r = chamar("/auth/v1/token?grant_type=refresh_token", new JSONObject().put("refresh_token", arm.get("refresh", "")).toString(), null);
            JSONObject j = new JSONObject(r);
            arm.put("access", j.getString("access_token"));
            arm.put("refresh", j.getString("refresh_token"));
            return true;
        } catch (SessaoExpirada e) {
            arm.put("erro", "Sessão expirada. Abra o app e entre de novo.");
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private String rpc(String nome, JSONObject args) throws Exception {
        try {
            return chamar("/rest/v1/rpc/" + nome, args.toString(), arm.get("access", ""));
        } catch (SessaoExpirada e) {
            if (!renovar()) throw e;
            return chamar("/rest/v1/rpc/" + nome, args.toString(), arm.get("access", ""));
        }
    }

    private void atualizarConfig() {
        try {
            JSONObject c = new JSONObject(rpc("loc_config_ler", new JSONObject()));
            arm.putB("cfg_ativo", c.getBoolean("ativo"));
            JSONArray d = c.getJSONArray("dias"); StringBuilder sb = new StringBuilder();
            for (int i = 0; i < d.length(); i++) { if (i > 0) sb.append(','); sb.append(d.getInt(i)); }
            arm.put("dias", sb.toString());
            arm.put("inicio", c.getString("inicio"));
            arm.put("fim", c.getString("fim"));
            arm.put("intervalo", String.valueOf(c.getInt("intervalo_s")));
            String er = arm.get("erro", "");
            if (er.startsWith("Horário") || er.startsWith("Sem conexão")) arm.put("erro", "");
        } catch (SessaoExpirada e) {
            arm.put("erro", "Sessão expirada. Abra o app e entre de novo.");
        } catch (Exception e) {
            String m = String.valueOf(e.getMessage());
            if (arm.get("inicio", null) == null) arm.put("erro", "Horário de trabalho não carregou: " + m.substring(0, Math.min(160, m.length())));
        }
    }

    private void enviar() {
        for (int rodada = 0; rodada < 10; rodada++) {
            JSONArray lote = arm.lote(100);
            if (lote.length() == 0) return;
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (wl == null) wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "rastreador:envio");
                wl.acquire(30_000);
                rpc("loc_registrar", new JSONObject().put("_dispositivo", arm.get("nome", "Celular")).put("_pontos", lote));
                arm.removerInicio(lote.length());
                arm.putL("ultimo_envio", System.currentTimeMillis());
                arm.put("erro_envio", "");
                if (!"Sessão expirada. Abra o app e entre de novo.".equals(arm.get("erro", ""))) { /* mantem avisos de GPS */ }
            } catch (Exception e) {
                String m = String.valueOf(e.getMessage());
                arm.put("erro_envio", m.substring(0, Math.min(160, m.length())));
                return; // sem rede: tenta no proximo ciclo, os pontos continuam guardados
            } finally {
                try { if (wl != null && wl.isHeld()) wl.release(); } catch (Throwable ignored) { }
            }
        }
    }

    // ------------------------------------------------------------ notificacao
    private void criarCanal() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CANAL, "Celular da empresa", NotificationManager.IMPORTANCE_LOW);
            ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
    }

    private Notification notificacao(String texto) {
        Intent abrir = new Intent(this, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(this, 0, abrir, flags);
        return new NotificationCompat.Builder(this, CANAL)
                .setContentTitle("Celular da empresa")
                .setContentText(texto)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true).setContentIntent(pi).setPriority(NotificationCompat.PRIORITY_LOW).build();
    }
}
