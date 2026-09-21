import { useEffect } from 'react';
import { SearchSelect } from './ui';

/**
 * El color de una línea (pedido, orden de compra, compra, traslado…): un select
 * con buscador, para escribir "cam" y llegar a Camello en vez de recorrer la
 * lista con el ratón. Las opciones son los colores que ya tiene la tela; se
 * encuentra también escribiendo su código (0074).
 *
 * Si la tela solo tiene un color no hay nada que elegir: se toma solo, en el
 * momento, y no se ofrece limpiarlo.
 *
 *   colores   — [{ id, nombre, codigo }]
 *   value     — id del color elegido ('' = ninguno)
 *   onChange  — (id: string) => void ('' si se limpia)
 *   describir — (color) => texto de la opción, si hace falta más que el nombre
 *               y el código (p. ej. los metros que hay de ese color)
 */
export default function ColorSelect({
    colores = [],
    value = '',
    onChange,
    label = 'Color',
    placeholder = 'Cualquier color',
    describir,
    ...props
}) {
    const texto = (c) =>
        describir ? describir(c) : c.codigo ? `${c.nombre} (${c.codigo})` : c.nombre;

    const unico = colores.length === 1 ? String(colores[0].id) : null;

    // Un solo color posible: queda elegido sin que nadie lo toque.
    useEffect(() => {
        if (unico && String(value ?? '') !== unico) onChange?.(unico);
    }, [unico, value]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <SearchSelect
            label={label}
            value={value ? String(value) : ''}
            onChange={(id) => onChange?.(id ?? '')}
            placeholder={placeholder}
            emptyText="Sin coincidencias"
            clearable={unico ? false : undefined}
            options={colores.map((c) => ({
                value: String(c.id),
                label: texto(c),
                keywords: c.codigo ?? '',
            }))}
            {...props}
        />
    );
}
