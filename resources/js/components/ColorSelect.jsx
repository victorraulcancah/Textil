import { SearchSelect } from './ui';

/**
 * El color de una línea (pedido, orden de compra, compra, traslado…): un select
 * con buscador, para escribir "cam" y llegar a Camello en vez de recorrer la
 * lista con el ratón. Las opciones son los colores que ya tiene la tela; se
 * encuentra también escribiendo su código (0074).
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

    return (
        <SearchSelect
            label={label}
            value={value ? String(value) : ''}
            onChange={(id) => onChange?.(id ?? '')}
            placeholder={placeholder}
            emptyText="Sin coincidencias"
            options={colores.map((c) => ({
                value: String(c.id),
                label: texto(c),
                keywords: c.codigo ?? '',
            }))}
            {...props}
        />
    );
}
