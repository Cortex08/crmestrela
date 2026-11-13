package br.com.estreladedavi.rastreador;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "Rastreador", permissions = {
        @Permission(alias = "loc", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "bg", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION })
})
public class RastreadorPlugin extends Plugin {

    private boolean tem(String p) { return ContextCompat.checkSelfPermission(getContext(), p) == PackageManager.PERMISSION_GRANTED; }

    private boolean semRestricaoBateria() {
        try { return ((PowerManager) getContext().getSystemService(Context.POWER_SERVICE)).isIgnoringBatteryOptimizations(getContext().getPackageName()); }
        catch (Throwable t) { return true; }
    }

    private void iniciarServico() {
        ContextCompat.startForegroundService(getContext(), new Intent(getContext(), RastreioService.class));
    }

    @PluginMethod
    public void configurar(PluginCall call) {
        Armazem a = new Armazem(getContext());
        a.put("url", call.getString("url", ""));
        a.put("key", call.getString("key", ""));
        a.put("access", call.getString("access", ""));
        a.put("refresh", call.getString("refresh", ""));
        a.put("nome", call.getString("nome", "Celular"));
        a.put("erro", "");
        a.putB("ativo", true);
        try { iniciarServico(); } catch (Throwable t) { a.put("erro", "Não foi possível iniciar o serviço: " + t.getMessage()); }
        call.resolve();
    }

    @PluginMethod
    public void parar(PluginCall call) {
        new Armazem(getContext()).limparSessao();
        getContext().stopService(new Intent(getContext(), RastreioService.class));
        call.resolve();
    }

    @PluginMethod
    public void garantirServico(PluginCall call) {
        if (new Armazem(getContext()).getB("ativo", false) && !RastreioService.rodando) {
            try { iniciarServico(); } catch (Throwable ignored) { }
        }
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        Armazem a = new Armazem(getContext());
        JSObject r = new JSObject();
        r.put("ativo", a.getB("ativo", false));
        r.put("rodando", RastreioService.rodando);
        r.put("naJanela", a.getB("na_janela", false));
        r.put("pendentes", a.pendentes());
        r.put("ultimoEnvio", a.getL("ultimo_envio", 0));
        r.put("ultimoGps", a.getL("ultimo_gps", 0));
        r.put("erro", a.get("erro", ""));
        r.put("inicio", a.get("inicio", ""));
        r.put("fim", a.get("fim", ""));
        r.put("nome", a.get("nome", ""));
        r.put("permLocal", tem(Manifest.permission.ACCESS_FINE_LOCATION));
        r.put("permSegundoPlano", Build.VERSION.SDK_INT < 29 || tem(Manifest.permission.ACCESS_BACKGROUND_LOCATION));
        r.put("semRestricaoBateria", semRestricaoBateria());
        call.resolve(r);
    }

    @PluginMethod
    public void pedirLocalizacao(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && !tem(Manifest.permission.POST_NOTIFICATIONS) && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 9001);
        }
        if (tem(Manifest.permission.ACCESS_FINE_LOCATION)) { call.resolve(); return; }
        requestPermissionForAlias("loc", call, "aposLocal");
    }

    @PermissionCallback
    private void aposLocal(PluginCall call) { call.resolve(); }

    @PluginMethod
    public void pedirSegundoPlano(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29 || tem(Manifest.permission.ACCESS_BACKGROUND_LOCATION)) { call.resolve(); return; }
        requestPermissionForAlias("bg", call, "aposSegundoPlano");
    }

    @PermissionCallback
    private void aposSegundoPlano(PluginCall call) { call.resolve(); }

    @PluginMethod
    public void pedirSemRestricaoBateria(PluginCall call) {
        try {
            if (!semRestricaoBateria()) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
        } catch (Throwable ignored) { }
        call.resolve();
    }

    @PluginMethod
    public void abrirConfiguracoes(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Throwable ignored) { }
        call.resolve();
    }
}
