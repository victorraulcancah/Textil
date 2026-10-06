/**
 * Llenar una columna de cantidades iguales con solo dar Enter. En el campo de una fila se escribe el valor y, al pulsar
 * Enter, se copia al campo de la fila siguiente y el cursor pasa a ese campo; otro Enter y sigue copiando a la que viene.
 * Sin haber escrito nada, Enter solo cambia de campo.
 *
 *   editando  — ref (`useRef(null)`) con la clave de la fila cuyo valor se está escribiendo o se recibió por copia
 *   actual    — { clave, valor } de la fila donde se pulsó Enter
 *   siguiente — { clave, valor } de la fila que sigue (null si es la última)
 *   copiar    — (claveSiguiente, valor) => void: guarda el valor en la fila siguiente
 *   atributo  — el data-* de los campos (por ejemplo data-rollos); su valor es la clave de la fila
 */
export function enterCopiar({ e, editando, actual, siguiente, copiar, atributo }) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!siguiente) return;
    if (editando.current === actual.clave && String(actual.valor) !== String(siguiente.valor)) {
        copiar(siguiente.clave, actual.valor);
        editando.current = siguiente.clave;
    } else {
        editando.current = null;
    }
    const campo = document.querySelector(`[${atributo}="${siguiente.clave}"]`);
    campo?.focus();
    campo?.select();
}
