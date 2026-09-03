@props(['firmas' => ['Entregado por', 'Recibido por'], 'formato' => 'a4'])

@if ($formato !== 'ticket')
    <table style="margin-top: 40px;">
        <tr>
            @foreach ($firmas as $f)
                <td class="center" style="padding: 0 20px;">
                    <div style="border-top: 1px solid #999; padding-top: 4px;" class="muted">{{ $f }}</div>
                </td>
            @endforeach
        </tr>
    </table>
@endif
