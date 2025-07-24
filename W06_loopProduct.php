<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loop_for_showProduct</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.7/dist/css/bootstrap.min.css">
    <link href="https://cdn.datatables.net/2.0.8/css/dataTables.dataTables.min.css" rel="stylesheet">
    <script src="https://cdn.datatables.net/2.0.8/js/dataTables.min.js"></script>
    <style>
        .container {
            max-width: 800px;
        }
    </style>
</head>

<body>
    <?php
    $products = [
        ['id' => 1000, 'name' => 'apple', 'price' => 60, 'quality' => 520],
        ['id' => 1001, 'name' => 'pen', 'price' => 160, 'quality' => 500],
        ['id' => 1002, 'name' => 'book', 'price' => 260, 'quality' => 501],
        ['id' => 1003, 'name' => 'ice', 'price' => 10, 'quality' => 530],
        ['id' => 1004, 'name' => 'lay', 'price' => 20, 'quality' => 450],
        ['id' => 1005, 'name' => 'blueberry', 'price' => 70, 'quality' => 580],
        ['id' => 1006, 'name' => 'starwberry', 'price' => 70, 'quality' => 590],
        ['id' => 1007, 'name' => 'cake', 'price' => 200, 'quality' => 507],
        ['id' => 1008, 'name' => 'pencil', 'price' => 10, 'quality' => 560],
        ['id' => 1009, 'name' => 'lychee', 'price' => 75, 'quality' => 540],
        ['id' => 1010, 'name' => 'grape', 'price' => 90, 'quality' => 150],
        ['id' => 1011, 'name' => 'green apple', 'price' => 80, 'quality' => 350],
        ['id' => 1012, 'name' => 'phone', 'price' => 1000, 'quality' => 550],
        ['id' => 1013, 'name' => 'mouse', 'price' => 150, 'quality' => 505],
        ['id' => 1014, 'name' => 'microphone', 'price' => 300, 'quality' => 506],
        ['id' => 1015, 'name' => 'mango', 'price' => 150, 'quality' => 510],
    ];

    $filteredProducts = $products;

    if (isset($_POST['price']) && $_POST['price'] !== '') {
        $filterPrice = $_POST['price'];
        $filteredProducts = array_filter($products, function ($product) use ($filterPrice) {
            return ($product['price']) == ($filterPrice);
        });
        // แก้ชื่อตัวแปรให้ถูกต้อง
        $filteredProducts = array_values($filteredProducts);
    }
    ?>
    <div class="container mt-5">
        <h1>Product list</h1>
        <form action="" method="post" class="mb-3">
            <div>
                <input type="number" name="price" placeholder="Enter Price" class="form-control mb-2">
            </div>
            <button type="submit" class="btn btn-primary">filter</button>
        </form>
        <table id="productTable" class="table table-striped table-bordered">
            <thead>
                <tr>
                    <th>#</th>
                    <th>id</th>
                    <th>name</th>
                    <th>price</th>
                    <th>quality</th>
                </tr>
            </thead>
            <tbody>
                <?php
                foreach ($filteredProducts as $index => $product) {
                    echo "<tr>";
                    echo "<td>" . ($index + 1) . "</td>";
                    echo "<td>" . $product['id'] . "</td>";
                    echo "<td>" . $product['name'] . "</td>";
                    echo "<td>" . $product['price'] . "</td>";
                    echo "<td>" . $product['quality'] . "</td>";
                    echo "</tr>";
                }
                ?>
            </tbody>
        </table>
    </div>
    <script src="https://code.jquery.com/jquery-3.5.1.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.7/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.datatables.net/2.0.8/js/dataTables.min.js"></script>
    <script>
        let table = new DataTable('#productTable');
    </script>
</body>

</html>