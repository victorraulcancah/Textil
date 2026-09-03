<?php

namespace App\Pdf;

/**
 * Contrato de un documento imprimible. Cada implementación sabe cargar su
 * modelo con las relaciones necesarias y armar los datos que consume la
 * vista Blade. El PdfService se encarga del resto (papel, márgenes, empresa).
 */
interface DocumentoPdf
{
    /** Vista Blade base, sin el sufijo de formato. Ej: 'pdf.documentos.nota-venta'. */
    public function vista(): string;

    /** Formatos soportados: 'a4', 'ticket' o ambos. */
    public function formatos(): array;

    /**
     * Carga el registro por id (con sus relaciones) y devuelve los datos para
     * la vista. Debe lanzar ModelNotFoundException si no existe.
     */
    public function datos(int $id): array;

    /** Nombre del archivo (sin extensión). Ej: 'nota-venta-NV01-00000012'. */
    public function archivo(int $id): string;
}
