package br.com.estreladedavi.rastreador;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        final Thread.UncaughtExceptionHandler antigo = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                java.io.StringWriter sw = new java.io.StringWriter();
                e.printStackTrace(new java.io.PrintWriter(sw));
                String txt = sw.toString();
                new Armazem(getApplicationContext()).put("crash", txt.substring(0, Math.min(600, txt.length())));
            } catch (Throwable ignored) { }
            if (antigo != null) antigo.uncaughtException(t, e);
        });
        registerPlugin(RastreadorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
