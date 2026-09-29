<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Un distrito del Perú con su código INEI (el que usa SUNAT): 150101 = LIMA / LIMA / LIMA. */
class Ubigeo extends Model
{
    protected $table = 'ubigeos';
    protected $primaryKey = 'ubigeo';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;
}
