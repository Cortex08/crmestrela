package br.com.estreladedavi.rastreador;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

/** Liga o rastreio sozinho quando o celular liga ou o app e atualizado. */
public class InicioReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) {
        try {
            if (new Armazem(ctx).getB("ativo", false)) {
                ContextCompat.startForegroundService(ctx, new Intent(ctx, RastreioService.class));
            }
        } catch (Throwable ignored) { }
    }
}
